import { describe, expect, it } from "vitest";
import {
  createBlock,
  document,
  parseInteractiveEnvelope,
  type JsonValue,
} from "@publisle/schema";
import { createRegistry, assertPrepared, prepare } from "@publisle/core";
import { createRenderPlan } from "../src/render-plan.ts";
import {
  compilePublication,
  instantiatePublication,
} from "../src/publication.ts";
import { instantiateHtml } from "../src/html.ts";
const values: JsonValue[] = [
  { sample: true },
  [1, "x", null],
  "text",
  42,
  false,
  null,
];
const definition = {
  type: "example:any-json" as const,
  schemaVersion: 1,
  schema: {
    parse: (value: unknown) =>
      parseInteractiveEnvelope(value, (payload) => payload as JsonValue),
  },
  island: () => ({ activation: "load" as const }),
};
const registry = createRegistry([definition]);
describe("exchange/delivery atomic beta ABI", () => {
  it.each(values.map((payload) => [payload] as const))(
    "native render plan and artifact retain the exact typed payload %j",
    (payload) => {
      const block = createBlock({
        type: definition.type,
        data: {
          activation: "load",
          payload,
          initialState: null,
          fallback: [
            {
              type: "paragraph",
              content: [{ type: "text", value: "Useful fallback." }],
            },
          ],
        },
      });
      const prepared = assertPrepared(
        prepare(document({ blocks: [block] }), { registry }),
      );
      const plan = createRenderPlan(prepared, {
        renderers: {
          [definition.type]: { module: "./ApprovedHostImplementation" },
        },
      });
      const artifact = compilePublication(plan);
      const encoded = JSON.stringify(plan.nodes);
      expect(encoded).toContain(JSON.stringify(payload));
      expect(artifact.islands[0]?.props).toMatchObject({
        inputVersion: 1,
        block: { id: block.id, type: block.type, schemaVersion: 1 },
        payload,
        initialState: null,
      });
      expect(JSON.stringify(artifact.islands[0]?.props)).toBe(
        JSON.stringify(
          (plan.nodes[0]?.kind === "element"
            ? plan.nodes[0].children.find((node) => node.kind === "island")
            : undefined
          )?.props,
        ),
      );
      expect(artifact.compatibility?.islandInputVersion).toBe(1);
      expect(artifact.html).not.toContain('type="application/json"');
    },
  );
  it("uses approved static lowering/authored fallback and diagnoses unsupported framework components", () => {
    const block = createBlock({
      type: definition.type,
      data: { activation: "load", payload: null },
    });
    const prepared = assertPrepared(
      prepare(document({ blocks: [block] }), { registry }),
    );
    const unsupported = compilePublication(prepared, {
      renderers: { [definition.type]: { static: { module: "./Static" } } },
    });
    expect(
      unsupported.diagnostics.some(
        (item) =>
          item.code === "unsupported-artifact-component" &&
          item.level === "error",
      ),
    ).toBe(true);
    expect(unsupported.html).not.toContain("data-publisle-static");
    const lowered = compilePublication(prepared, {
      renderers: {
        [definition.type]: {
          static: {
            module: "./Static",
            lower: (input) => [
              {
                kind: "text",
                value: `Declared static value: ${JSON.stringify(input.payload)}`,
              },
            ],
          },
        },
      },
    });
    expect(lowered.html).toContain("Declared static value: null");
    expect(lowered.compatibility?.staticFidelity).toBe("fallback");
    const empty = compilePublication(
      assertPrepared(
        prepare(
          document({
            blocks: [
              {
                ...block,
                data: {
                  activation: "load",
                  payload: null,
                  fallback: [{ type: "paragraph", content: [] }],
                },
              },
            ],
          }),
          { registry },
        ),
      ),
      {
        renderers: { [definition.type]: { static: { module: "./Static" } } },
      },
    );
    expect(empty.compatibility?.staticFidelity).toBe("unsupported");
  });
  it("namespaces generated fragment, ARIA, label and table references across two placements", () => {
    const html =
      '<label for="field" aria-controls="field other" aria-describedby="help">Name</label><input data-publisle-id="field" id="field" aria-details="help"/><p data-publisle-id="help" id="help">Help</p><th data-publisle-id="header" id="header">Header</th><td headers="header external">Cell</td><a href="#field">Link</a>';
    const first = instantiateHtml(html, "one");
    const second = instantiateHtml(html, "two");
    for (const [rendered, prefix] of [
      [first, "one"],
      [second, "two"],
    ]) {
      expect(rendered).toContain(`for="${prefix}-field"`);
      expect(rendered).toContain(`aria-controls="${prefix}-field other"`);
      expect(rendered).toContain(`aria-describedby="${prefix}-help"`);
      expect(rendered).toContain(`headers="${prefix}-header external"`);
      expect(rendered).toContain(`href="#${prefix}-field"`);
    }
    expect(() => instantiateHtml(html, '../unsafe"')).toThrow();
  });
  it("separates diagnostic positions from semantic/artifact identities and records host build inputs", () => {
    const input = document({
      blocks: [
        createBlock({
          type: definition.type,
          data: { activation: "load", payload: true },
        }),
      ],
    });
    const first = assertPrepared(prepare(input, { registry }));
    const located = assertPrepared(
      prepare(input, {
        registry,
        sourceMap: {
          document: { line: 100, column: 3, source: "moved.md" },
          blocks: {},
        },
      }),
    );
    expect(first.sourceIdentity).toBe(located.sourceIdentity);
    expect(first.semanticIdentity).toBe(located.semanticIdentity);
    expect(first.diagnosticIdentity).not.toBe(located.diagnosticIdentity);
    const build = {
      configuration: {
        implementationRevision: "sha256:host-pin",
        algorithm: "explicit",
      },
      reproducible: true,
      seed: 42,
    };
    const a = compilePublication(first, { build });
    const b = compilePublication(located, { build });
    expect(a.identity).toBe(b.identity);
    expect(a.provenance).toMatchObject({ reproducible: true, seed: 42 });
    expect(compilePublication(first).provenance?.reproducible).toBe(false);
    expect(
      compilePublication(first, { build: { ...build, seed: 43 } }).identity,
    ).not.toBe(a.identity);
    expect(
      compilePublication(first, {
        build: {
          ...build,
          configuration: { implementationRevision: "different-host-pin" },
        },
      }).identity,
    ).not.toBe(a.identity);
    expect(instantiatePublication(a, "one").instanceId).not.toBe(
      instantiatePublication(a, "two").instanceId,
    );
  });
});
