import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { compilePaper } from "@publisle/playground-core/compile-service";

// Dev-server endpoint for the playground "Compile PDF" button: runs the
// Research CLI export on the posted document. Never part of the production
// build; the compiler itself comes from the local Research setup.
function paperCompileApi(): Plugin {
  return {
    name: "paper-compile-api",
    configureServer(server) {
      server.middlewares.use("/api/compile-paper", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ ok: false, message: "POST only." }));
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += String(chunk);
        });
        req.on("end", () => {
          let request: unknown;
          try {
            request = JSON.parse(body) as unknown;
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, message: "Invalid JSON." }));
            return;
          }
          let result;
          try {
            result = compilePaper(
              request as Parameters<typeof compilePaper>[0],
            );
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                ok: false,
                message: error instanceof Error ? error.message : String(error),
              }),
            );
            return;
          }
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result));
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), paperCompileApi()],
  // A workspace module must not import the side-effectful application entry.
  build: { rolldownOptions: { preserveEntrySignatures: "strict" } },
});
