import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PublisleArticle } from "@publisle/adapter-react";
import "@publisle/adapter-core/document.css";
import "@publisle/adapter-core/katex.css";
import { metadata, publication } from "./counter.md";
import Schematic from "./Schematic.tsx";

const implementations = {
  "demo:interactive-scene": () => import("@publisle/example-scene/react"),
  "publisle:interactive-schematic": () =>
    Promise.resolve({ default: Schematic }),
};

function App() {
  return (
    <StrictMode>
      <nav aria-label="Breadcrumb">Documentation / Counters</nav>
      <main>
        <h1>{metadata?.title}</h1>
        <PublisleArticle
          publication={publication}
          instanceId="primary"
          implementations={implementations}
        />
        <PublisleArticle
          publication={publication}
          instanceId="secondary"
          implementations={implementations}
        />
      </main>
      <footer>Unrelated host content</footer>
    </StrictMode>
  );
}

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root element.");
createRoot(root).render(<App />);
