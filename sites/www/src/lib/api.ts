// Publisle API client (playground PDF + future services). The endpoint runs on
// a separate host (api.publisle.xyz); until the PDF service ships, compilePdf
// is feature-flagged and the client only reports health. Everything is typed so
// enabling the service later is configuration, not restructuring.
export const API_URL: string =
  (import.meta.env.PUBLIC_API_URL as string | undefined) ??
  "https://api.publisle.xyz";

export const PDF_ENABLED: boolean =
  import.meta.env.PUBLIC_PDF_ENABLED === "true";

export interface ApiHealth {
  readonly status: string;
  readonly service?: string;
  readonly services?: { readonly pdf?: boolean };
}

export type ApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

export async function fetchHealth(
  timeoutMs = 4000,
): Promise<ApiResult<ApiHealth>> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(`${API_URL}/health`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        message: `Health check failed (${String(response.status)}).`,
      };
    }
    return { ok: true, value: (await response.json()) as ApiHealth };
  } catch (cause) {
    return {
      ok: false,
      message:
        cause instanceof Error ? cause.message : "API endpoint unreachable.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface CompilePdfRequest {
  readonly markdown: string;
  readonly template: string;
  readonly engine?: "pdflatex" | "lualatex";
}

export type CompilePdfResult = ApiResult<{ readonly pdfBase64: string }>;

export async function compilePdf(
  request: CompilePdfRequest,
): Promise<CompilePdfResult> {
  if (!PDF_ENABLED) {
    return { ok: false, message: "PDF export is not enabled yet." };
  }
  try {
    const response = await fetch(`${API_URL}/pdf/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const payload = (await response.json()) as {
      readonly ok?: boolean;
      readonly pdfBase64?: string;
      readonly message?: string;
    };
    if (!response.ok || !payload.ok || !payload.pdfBase64) {
      return {
        ok: false,
        message:
          payload.message ?? `Compilation failed (${String(response.status)}).`,
      };
    }
    return { ok: true, value: { pdfBase64: payload.pdfBase64 } };
  } catch (cause) {
    return {
      ok: false,
      message:
        cause instanceof Error ? cause.message : "Could not reach the API.",
    };
  }
}
