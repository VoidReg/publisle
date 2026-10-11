// Publisle API stub (api.publisle.xyz). Zero dependencies: Node 24 built-ins
// only. Serves health for the site's status pill and a 503 placeholder for PDF
// compilation until the Research export service is enabled behind the same
// contract. Run under systemd (publisle-api.service) behind Caddy.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8787);
const PDF_ENABLED = process.env.PDF_ENABLED === "true";

const json = (response, status, payload) => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
};

const server = createServer((request, response) => {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );

  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, {
      status: "ok",
      service: "publisle-api",
      services: { pdf: PDF_ENABLED },
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/pdf/compile") {
    if (!PDF_ENABLED) {
      json(response, 503, {
        ok: false,
        message: "PDF compilation is not enabled on this endpoint yet.",
      });
      return;
    }
    json(response, 501, {
      ok: false,
      message: "PDF compilation is enabled but not implemented yet.",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    json(response, 200, {
      service: "publisle-api",
      endpoints: ["GET /health", "POST /pdf/compile"],
      docs: "https://publisle.xyz",
    });
    return;
  }

  json(response, 404, { ok: false, message: "Not found." });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `publisle-api listening on 127.0.0.1:${String(PORT)} (pdf: ${String(PDF_ENABLED)})`,
  );
});
