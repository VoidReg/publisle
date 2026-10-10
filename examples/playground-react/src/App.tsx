import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PublisleArticle } from "@publisle/adapter-react";
import { compilePublication } from "@publisle/adapter-core";
import { prepare } from "@publisle/core";
import type { Diagnostic } from "@publisle/schema";
import {
  BLOCK_TYPES,
  BLOCK_LABELS,
  DocumentEditor,
  FOURIER_ARTICLE,
  FOURIER_PARTIAL_SUMS,
  RESEARCH_PAPER,
  metadataAuthors,
  metadataField,
  metadataSubjects,
  withMetadataAuthors,
  withMetadataField,
  withMetadataSubjects,
  type AuthorRow,
} from "@publisle/playground-core";
import { BlockEditor } from "./BlockEditor.tsx";
import {
  createMermaidPreview,
  mermaidSources,
} from "@publisle/playground-core/mermaid";

const PAPER_TEMPLATES = [
  { value: "article", label: "Standard article (PDF/UA-2, LuaLaTeX)" },
  { value: "ieee-journal", label: "IEEE journal" },
  { value: "acm-journal", label: "ACM journal (needs country data)" },
  { value: "elsevier-numeric", label: "Elsevier (numeric)" },
  { value: "springer-journal", label: "Springer journal" },
];

interface CompileState {
  state: "idle" | "busy" | "ok" | "error";
  message?: string;
  pdfUrl?: string;
  diagnostics?: { code: string; message: string }[];
}

const editor = new DocumentEditor();
const implementations = {
  "demo:interactive-scene": () => import("@publisle/example-scene/react"),
  "demo:fourier-partial-sum": () => import("@publisle/example-fourier/react"),
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
  const [diagrams] = useState(createMermaidPreview);
  const diagramStatus = useSyncExternalStore(
    diagrams.subscribe,
    diagrams.getSnapshot,
    diagrams.getSnapshot,
  );
  useEffect(() => {
    diagrams.start();
    return () => {
      diagrams.dispose();
    };
  }, [diagrams]);
  useEffect(() => {
    diagrams.update(mermaidSources(document));
  }, [diagrams, document]);
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [payloadFormatting, setPayloadFormatting] = useState<
    "pretty" | "compact"
  >("pretty");
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [paperTemplate, setPaperTemplate] = useState("ieee-journal");
  const [paperEngine, setPaperEngine] = useState<
    "default" | "pdflatex" | "lualatex"
  >("default");
  const [compile, setCompile] = useState<CompileState>({ state: "idle" });

  async function handleCompilePdf() {
    setCompile({ state: "busy" });
    try {
      const exported = editor.exportMarkdown();
      const response = await fetch("/api/compile-paper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          markdown: exported.markdown,
          template: paperTemplate,
          ...(paperEngine === "default" ? {} : { engine: paperEngine }),
        }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        pdfBase64?: string;
        diagnostics?: { code: string; message: string }[];
      };
      if (!response.ok || !body.ok || body.pdfBase64 === undefined)
        throw new Error(
          body.message ?? `Compile failed (${String(response.status)}).`,
        );
      const bytes = Uint8Array.from(atob(body.pdfBase64), (character) =>
        character.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" }),
      );
      setCompile({
        state: "ok",
        pdfUrl: url,
        ...(body.diagnostics ? { diagnostics: body.diagnostics } : {}),
      });
    } catch (cause) {
      setCompile({
        state: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  function updateMetadata(key: string, value: string): void {
    editor.setMetadata(
      withMetadataField(
        document.metadata,
        key,
        value,
      ) as typeof document.metadata,
    );
  }

  function updateSubjects(csv: string): void {
    editor.setMetadata(
      withMetadataSubjects(document.metadata, csv) as typeof document.metadata,
    );
  }

  function updateAuthors(rows: AuthorRow[]): void {
    editor.setMetadata(
      withMetadataAuthors(document.metadata, rows) as typeof document.metadata,
    );
  }

  const publication = useMemo(() => {
    const prepared = prepare(document, { registry: editor.registry });
    if (!prepared.document) return undefined;
    return compilePublication(prepared.document, {
      diagramRenderers: { mermaid: diagrams.rendererFor(prepared.document) },
    });
  }, [document, editor.registry, diagrams, diagramStatus]);

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
    const result = editor.exportMarkdown({ payloadFormatting });
    if (result.markdown) {
      download("document.md", result.markdown);
    }
    setDiagnostics(result.diagnostics);
  };

  const handleExportJson = () => {
    download("document.json", editor.toJson(), "application/json");
  };

  const handleExportArchive = () => {
    const result = editor.exportMarkdown({ policy: "archival" });
    if (result.markdown) download("document.archive.md", result.markdown);
    setDiagnostics(result.diagnostics);
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
            onClick={() =>
              setDiagnostics(editor.importMarkdown(FOURIER_ARTICLE).diagnostics)
            }
          >
            Load Fourier article
          </button>
          <button
            type="button"
            onClick={() =>
              setDiagnostics(editor.importMarkdown(RESEARCH_PAPER).diagnostics)
            }
          >
            Load research paper
          </button>
          <button
            type="button"
            onClick={() =>
              setDiagnostics(
                editor.importMarkdown(FOURIER_PARTIAL_SUMS).diagnostics,
              )
            }
          >
            Load Fourier model
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
          <button type="button" onClick={handleExportArchive}>
            Export archival Markdown
          </button>
          <label>
            Payload JSON{" "}
            <select
              value={payloadFormatting}
              onChange={(event) =>
                setPayloadFormatting(
                  event.target.value === "compact" ? "compact" : "pretty",
                )
              }
            >
              <option value="pretty">Readable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
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

      <details className="meta-panel">
        <summary>Document metadata</summary>
        <div className="meta-panel__grid">
          <label>
            Title
            <input
              type="text"
              value={metadataField(document.metadata, "title")}
              onChange={(event) => updateMetadata("title", event.target.value)}
            />
          </label>
          <label>
            Language
            <input
              type="text"
              value={metadataField(document.metadata, "language")}
              onChange={(event) =>
                updateMetadata("language", event.target.value)
              }
            />
          </label>
          <label>
            Subjects (comma-separated)
            <input
              type="text"
              value={metadataSubjects(document.metadata)}
              onChange={(event) => updateSubjects(event.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              rows={2}
              value={metadataField(document.metadata, "description")}
              onChange={(event) =>
                updateMetadata("description", event.target.value)
              }
            />
          </label>
          <div className="meta-panel__authors">
            <span>Authors</span>
            {metadataAuthors(document.metadata).map((author, index) => (
              <div className="segment" key={index}>
                <input
                  type="text"
                  value={author.name}
                  placeholder="Name"
                  aria-label={`Author ${String(index + 1)} name`}
                  onChange={(event) => {
                    const rows: AuthorRow[] = metadataAuthors(
                      document.metadata,
                    );
                    rows[index] = {
                      name: event.target.value,
                      affiliation: rows[index]?.affiliation ?? "",
                    };
                    updateAuthors(rows);
                  }}
                />
                <input
                  type="text"
                  value={author.affiliation}
                  placeholder="Affiliation"
                  aria-label={`Author ${String(index + 1)} affiliation`}
                  onChange={(event) => {
                    const rows: AuthorRow[] = metadataAuthors(
                      document.metadata,
                    );
                    rows[index] = {
                      name: rows[index]?.name ?? "",
                      affiliation: event.target.value,
                    };
                    updateAuthors(rows);
                  }}
                />
                <button
                  type="button"
                  aria-label={`Remove author ${String(index + 1)}`}
                  onClick={() => {
                    const rows = metadataAuthors(document.metadata);
                    updateAuthors(
                      rows.filter((_, position) => position !== index),
                    );
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                updateAuthors([
                  ...metadataAuthors(document.metadata),
                  { name: "New Author", affiliation: "Affiliation" },
                ])
              }
            >
              Add author
            </button>
          </div>
        </div>
      </details>

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
          <div className="compile-bar">
            <label>
              Theme
              <select
                value={paperTemplate}
                onChange={(event) => setPaperTemplate(event.target.value)}
              >
                {PAPER_TEMPLATES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Engine
              <select
                value={paperEngine}
                onChange={(event) =>
                  setPaperEngine(
                    event.target.value as "default" | "pdflatex" | "lualatex",
                  )
                }
              >
                <option value="default">Template default</option>
                <option value="pdflatex">pdfLaTeX</option>
                <option value="lualatex">LuaLaTeX (PDF/UA-2)</option>
              </select>
            </label>
            <button
              type="button"
              disabled={compile.state === "busy"}
              onClick={() => void handleCompilePdf()}
            >
              {compile.state === "busy" ? "Compiling…" : "Compile PDF"}
            </button>
          </div>
          {compile.state === "ok" && compile.pdfUrl ? (
            <div className="compile-result" role="status">
              <a href={compile.pdfUrl} target="_blank" rel="noreferrer">
                Open compiled PDF
              </a>
              {(compile.diagnostics ?? []).map((item) => (
                <p key={item.code} className="muted">
                  [{item.code}] {item.message}
                </p>
              ))}
            </div>
          ) : null}
          {compile.state === "error" ? (
            <p className="compile-error" role="alert">
              {compile.message}
            </p>
          ) : null}
          {diagramStatus.pending > 0 && (
            <p role="status">Rendering {diagramStatus.pending} diagram(s)…</p>
          )}
          {diagramStatus.errors.length > 0 && (
            <div role="status">
              {diagramStatus.errors.map((error) => (
                <p key={error.source}>{error.message}</p>
              ))}
              <button type="button" onClick={() => diagrams.retry()}>
                Retry diagrams
              </button>
            </div>
          )}
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
