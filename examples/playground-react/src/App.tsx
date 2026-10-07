import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PublisleArticle } from "@publisle/adapter-react";
import { compilePublication } from "@publisle/adapter-core";
import { prepare } from "@publisle/core";
import type { Diagnostic } from "@publisle/schema";
import {
  BLOCK_TYPES,
  BLOCK_LABELS,
  DocumentEditor,
} from "@publisle/playground-core";
import { BlockEditor } from "./BlockEditor.tsx";

const editor = new DocumentEditor();
const implementations = {
  "publisle:interactive-schematic": () => import("./Schematic.tsx"),
};

function useDocument() {
  return useSyncExternalStore(
    (listener) => editor.subscribe(listener),
    () => editor.document,
    () => editor.document,
  );
}

function download(filename: string, content: string, type = "text/markdown") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const document = useDocument();
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const publication = useMemo(() => {
    const prepared = prepare(document, { registry: editor.registry });
    if (!prepared.document) return undefined;
    return compilePublication(prepared.document);
  }, [document, editor.registry]);

  const handleImportMarkdown = async (file: File) => {
    const text = await file.text();
    const result = editor.importMarkdown(text);
    setDiagnostics(result.diagnostics);
  };

  const handleImportJson = async (file: File) => {
    const text = await file.text();
    const result = editor.fromJson(text);
    setDiagnostics(result.diagnostics);
  };

  const handleExportMarkdown = () => {
    const result = editor.exportMarkdown();
    if (result.markdown) {
      download("document.md", result.markdown);
    }
    setDiagnostics(result.diagnostics);
  };

  const handleExportJson = () => {
    download("document.json", editor.toJson(), "application/json");
  };

  return (
    <div className="playground">
      <header className="toolbar">
        <h1>Publisle Playground (React)</h1>
        <div className="toolbar__actions">
          <button
            type="button"
            onClick={() => {
              editor.setDocument({ schemaVersion: 1, blocks: [] });
              setDiagnostics([]);
            }}
          >
            New
          </button>
          <button
            type="button"
            onClick={() => markdownInputRef.current?.click()}
          >
            Import Markdown
          </button>
          <button type="button" onClick={handleExportMarkdown}>
            Export Markdown
          </button>
          <button type="button" onClick={() => jsonInputRef.current?.click()}>
            Import JSON
          </button>
          <button type="button" onClick={handleExportJson}>
            Export JSON
          </button>
          <input
            ref={markdownInputRef}
            type="file"
            accept=".md,.markdown"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportMarkdown(file);
              event.target.value = "";
            }}
          />
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportJson(file);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <div className="playground__layout">
        <aside className="palette">
          <h2>Blocks</h2>
          {BLOCK_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => editor.addBlock(type)}
            >
              {BLOCK_LABELS[type]}
            </button>
          ))}
        </aside>

        <main className="editor">
          <h2>Editor</h2>
          {document.blocks.length === 0 ? (
            <p className="muted">Add a block from the palette to start.</p>
          ) : (
            document.blocks.map((block) => (
              <BlockEditor
                key={block.id}
                block={block}
                onRemove={(id) => editor.removeBlock(id)}
                onMove={(id, direction) => editor.moveBlock(id, direction)}
                onUpdate={(id, data) => editor.updateBlock(id, data)}
              />
            ))
          )}
        </main>

        <aside className="preview">
          <h2>Preview</h2>
          {publication ? (
            <>
              <PublisleArticle
                publication={publication}
                instanceId="primary"
                implementations={implementations}
              />
            </>
          ) : (
            <p className="muted">No preview available.</p>
          )}
        </aside>
      </div>

      {diagnostics.length > 0 && (
        <footer className="diagnostics">
          <h2>Diagnostics</h2>
          <ul>
            {diagnostics.map((diagnostic, index) => (
              <li key={index} data-level={diagnostic.level}>
                [{diagnostic.level}] {diagnostic.message}
              </li>
            ))}
          </ul>
        </footer>
      )}
    </div>
  );
}
