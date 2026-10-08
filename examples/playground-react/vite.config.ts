import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // A workspace module must not import the side-effectful application entry.
  build: { rolldownOptions: { preserveEntrySignatures: "strict" } },
});
