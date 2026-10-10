import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { compilePaper } from "@publisle/playground-core/compile-service";

export const prerender = false;

// Dev/preview endpoint for the playground "Compile PDF" button: runs the
// Research CLI export on the posted document.
export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Invalid JSON." }, { status: 400 });
  }
  try {
    const result = compilePaper(body as Parameters<typeof compilePaper>[0]);
    return json(result, {
      status: result.ok ? 200 : result.status < 500 ? 400 : 500,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
