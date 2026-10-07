import { describe, expect, it } from "vitest";
import { defaultScene, parseScenePayload } from "@publisle/example-scene";
import { prepare } from "@publisle/core";
import { CORE_REGISTRY, DocumentEditor } from "../src/editor.ts";

describe("host-owned scene block", () => {
  it("validates, prepares and round-trips the scene through both export choices", () => {
    const editor = new DocumentEditor();
    editor.addBlock("demo:interactive-scene");
    expect(
      prepare(editor.document, { registry: CORE_REGISTRY }).diagnostics,
    ).toEqual([]);
    expect(parseScenePayload(defaultScene().payload).objects).toHaveLength(3);
    for (const payloadFormatting of ["pretty", "compact"] as const) {
      const output = editor.exportMarkdown({ payloadFormatting });
      expect(output.markdown).toContain("publisle-payload");
      const restored = new DocumentEditor();
      expect(restored.importMarkdown(output.markdown!).diagnostics).toEqual([]);
      expect(restored.document).toEqual(editor.document);
    }
  });

  it.each([
    [
      "duplicate ID",
      (scene: ReturnType<typeof defaultScene>["payload"]) => {
        scene.objects[1]!.id = scene.objects[0]!.id;
      },
    ],
    [
      "negative dimensions",
      (scene: ReturnType<typeof defaultScene>["payload"]) => {
        scene.objects[0]!.geometry.dimensions[0] = -1;
      },
    ],
    [
      "zero scale",
      (scene: ReturnType<typeof defaultScene>["payload"]) => {
        scene.objects[0]!.scale[0] = 0;
      },
    ],
    [
      "invalid color",
      (scene: ReturnType<typeof defaultScene>["payload"]) => {
        scene.background = "not-a-color";
      },
    ],
    [
      "invalid camera",
      (scene: ReturnType<typeof defaultScene>["payload"]) => {
        scene.camera.fov = 180;
      },
    ],
    [
      "nonfinite transform",
      (scene: ReturnType<typeof defaultScene>["payload"]) => {
        scene.objects[0]!.position[0] = Infinity;
      },
    ],
    [
      "unsupported field",
      (scene: ReturnType<typeof defaultScene>["payload"]) => {
        Object.assign(scene.objects[0]!, { script: "alert(1)" });
      },
    ],
  ])("rejects %s", (_name, mutate) => {
    const scene = defaultScene().payload;
    mutate(scene);
    expect(() => parseScenePayload(scene)).toThrow();
  });
});
