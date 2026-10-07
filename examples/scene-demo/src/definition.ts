import { defineInteractiveBlock } from "@publisle/block-sdk";
import { parseFlowNodes, parseInlineNodes } from "@publisle/blocks-core";
import {
  SchemaParseError,
  type InteractiveEnvelope,
  type JsonValue,
} from "@publisle/schema";

export type Vector3 = [number, number, number];
export interface SceneObject {
  id: string;
  name: string;
  geometry: { type: "box" | "sphere" | "cylinder"; dimensions: Vector3 };
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  material: { color: string; roughness: number; metalness: number };
}
export interface ScenePayload {
  background: string;
  camera: { position: Vector3; target: Vector3; fov: number };
  lights: {
    ambient: { color: string; intensity: number };
    directional: { color: string; intensity: number; position: Vector3 };
  };
  objects: SceneObject[];
  controls: {
    orbit: boolean;
    pan: boolean;
    zoom: boolean;
    selection: boolean;
    reset: boolean;
  };
}

function fail(path: string, detail: string): never {
  throw new SchemaParseError("invalid-block-data", `${path}: ${detail}`);
}
function record(
  value: unknown,
  path: string,
  keys: string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(path, "must be an object");
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result))
    if (!keys.includes(key)) fail(`${path}.${key}`, "unsupported field");
  return result;
}
function number(
  value: unknown,
  path: string,
  min = -Infinity,
  max = Infinity,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(path, `must be finite and between ${String(min)} and ${String(max)}`);
  return value;
}
function vector(value: unknown, path: string, positive = false): Vector3 {
  if (!Array.isArray(value) || value.length !== 3)
    fail(path, "must contain three numbers");
  const result: Vector3 = [
    number(value[0], `${path}[0]`),
    number(value[1], `${path}[1]`),
    number(value[2], `${path}[2]`),
  ];
  if (positive && result.some((v) => v <= 0))
    fail(path, "all components must be positive");
  return result;
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim())
    fail(path, "must be a nonempty string");
  return value;
}
function color(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^#[\da-f]{6}$/iu.test(result))
    fail(path, "must be a six-digit hex color");
  return result;
}

export function parseScenePayload(value: unknown): ScenePayload {
  const data = record(value, "payload", [
    "background",
    "camera",
    "lights",
    "objects",
    "controls",
  ]);
  const camera = record(data["camera"], "camera", [
    "position",
    "target",
    "fov",
  ]);
  const position = vector(camera["position"], "camera.position");
  const target = vector(camera["target"], "camera.target");
  if (position.every((v, i) => v === target[i]))
    fail("camera", "position and target must differ");
  const lights = record(data["lights"], "lights", ["ambient", "directional"]);
  const ambient = record(lights["ambient"], "lights.ambient", [
    "color",
    "intensity",
  ]);
  const directional = record(lights["directional"], "lights.directional", [
    "color",
    "intensity",
    "position",
  ]);
  const controls = record(data["controls"], "controls", [
    "orbit",
    "pan",
    "zoom",
    "selection",
    "reset",
  ]);
  const control = (key: string): boolean => {
    const v = controls[key];
    if (typeof v !== "boolean") fail(`controls.${key}`, "must be a boolean");
    return v;
  };
  if (!Array.isArray(data["objects"])) fail("objects", "must be an array");
  const ids = new Set<string>();
  const objects = data["objects"].map(
    (value: unknown, i: number): SceneObject => {
      const path = `objects[${String(i)}]`;
      const obj = record(value, path, [
        "id",
        "name",
        "geometry",
        "position",
        "rotation",
        "scale",
        "material",
      ]);
      const id = text(obj["id"], `${path}.id`);
      if (ids.has(id)) fail(`${path}.id`, "duplicate object ID");
      ids.add(id);
      const geo = record(obj["geometry"], `${path}.geometry`, [
        "type",
        "dimensions",
      ]);
      const type = geo["type"];
      if (type !== "box" && type !== "sphere" && type !== "cylinder")
        fail(`${path}.geometry.type`, "expected box, sphere or cylinder");
      const material = record(obj["material"], `${path}.material`, [
        "color",
        "roughness",
        "metalness",
      ]);
      return {
        id,
        name: text(obj["name"], `${path}.name`),
        geometry: {
          type,
          dimensions: vector(
            geo["dimensions"],
            `${path}.geometry.dimensions`,
            true,
          ),
        },
        position: vector(obj["position"], `${path}.position`),
        rotation: vector(obj["rotation"], `${path}.rotation`),
        scale: vector(obj["scale"], `${path}.scale`, true),
        material: {
          color: color(material["color"], `${path}.material.color`),
          roughness: number(
            material["roughness"],
            `${path}.material.roughness`,
            0,
            1,
          ),
          metalness: number(
            material["metalness"],
            `${path}.material.metalness`,
            0,
            1,
          ),
        },
      };
    },
  );
  return {
    background: color(data["background"], "background"),
    camera: {
      position,
      target,
      fov: number(camera["fov"], "camera.fov", 1, 179),
    },
    lights: {
      ambient: {
        color: color(ambient["color"], "lights.ambient.color"),
        intensity: number(ambient["intensity"], "lights.ambient.intensity", 0),
      },
      directional: {
        color: color(directional["color"], "lights.directional.color"),
        intensity: number(
          directional["intensity"],
          "lights.directional.intensity",
          0,
        ),
        position: vector(
          directional["position"],
          "lights.directional.position",
        ),
      },
    },
    objects,
    controls: {
      orbit: control("orbit"),
      pan: control("pan"),
      zoom: control("zoom"),
      selection: control("selection"),
      reset: control("reset"),
    },
  };
}

// This contract belongs to the example host, not to Publisle's built-in blocks.
export const sceneDefinition = defineInteractiveBlock({
  type: "demo:interactive-scene",
  schemaVersion: 1,
  schema: { parse: parseScenePayload },
  descriptor: {
    displayName: "3D scene inspector",
    description:
      "Inspect a scene of named procedural objects with camera and selection controls.",
    payloadSchema: {
      type: "object",
      properties: {
        background: {
          type: "string",
          description: "Six-digit hex background color.",
        },
        camera: {
          type: "object",
          description:
            "Perspective camera position, target and field of view in degrees.",
        },
        lights: {
          type: "object",
          description:
            "Ambient and directional light colors, intensity and directional position.",
        },
        objects: {
          type: "array",
          description:
            "Named objects with IDs, geometry, transforms and material. Rotation uses radians. Box dimensions are width/height/depth; sphere uses the first dimension as radius; cylinder uses top radius/bottom radius/height.",
        },
        controls: {
          type: "object",
          description: "Flags enabling orbit, pan, zoom, selection and reset.",
        },
      },
      required: ["background", "camera", "lights", "objects", "controls"],
    },
    capabilities: {
      networkAccess: false,
      staticRendering: false,
      hostServices: [],
    },
  },
  content: {
    parseTitle: (value) =>
      parseInlineNodes(value, "content.title") as readonly JsonValue[],
    parseFlow: (value) => parseFlowNodes(value) as readonly JsonValue[],
  },
});

export function defaultScene(): InteractiveEnvelope<ScenePayload> {
  return {
    activation: "interaction",
    content: {
      title: [{ type: "text", value: "Explore a 3D scene" }],
      instructions: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              value:
                "Drag to orbit, scroll to zoom, or select a named object. Reset View restores the camera.",
            },
          ],
        },
      ],
    },
    fallback: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            value:
              "A blue box at (-2, 0, 0), an orange sphere at (0, 0, 0), and a green cylinder at (2, 0, 0).",
          },
        ],
      },
    ],
    payload: {
      background: "#162033",
      camera: { position: [6, 4, 8], target: [0, 0, 0], fov: 45 },
      lights: {
        ambient: { color: "#ffffff", intensity: 1.5 },
        directional: { color: "#ffffff", intensity: 3, position: [3, 5, 4] },
      },
      objects: [
        {
          id: "box",
          name: "Blue box",
          geometry: { type: "box", dimensions: [1.4, 1.4, 1.4] },
          position: [-2, 0, 0],
          rotation: [0, 0.3, 0],
          scale: [1, 1, 1],
          material: { color: "#4488ff", roughness: 0.5, metalness: 0.1 },
        },
        {
          id: "sphere",
          name: "Orange sphere",
          geometry: { type: "sphere", dimensions: [0.85, 0.85, 0.85] },
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          material: { color: "#ff9944", roughness: 0.5, metalness: 0.1 },
        },
        {
          id: "cylinder",
          name: "Green cylinder",
          geometry: { type: "cylinder", dimensions: [0.65, 0.65, 1.8] },
          position: [2, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          material: { color: "#44cc99", roughness: 0.5, metalness: 0.1 },
        },
      ],
      controls: {
        orbit: true,
        pan: true,
        zoom: true,
        selection: true,
        reset: true,
      },
    },
  };
}
