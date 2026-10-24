import {
  fromMarkdown,
  toMarkdown,
  type MarkdownExportOptions,
  type MarkdownExportResult,
} from "@publisle/markdown";
import {
  DocumentEditor as CoreEditor,
  type ImportResult,
} from "./editor-core.ts";
export * from "./editor-core.ts";
/** Editor with synchronous Markdown import and export. */
export class DocumentEditor extends CoreEditor {
  importMarkdown(source: string): ImportResult {
    const imported = fromMarkdown(source, {
      resolveSchemaVersion: (type) => this.registry.get(type)?.schemaVersion,
    });
    if (imported.document) {
      this.setDocument(imported.document);
    }
    return { diagnostics: imported.diagnostics };
  }

  exportMarkdown(options: MarkdownExportOptions = {}): MarkdownExportResult {
    return toMarkdown(this.document, options);
  }
}
