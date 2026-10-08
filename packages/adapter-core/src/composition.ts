import {
  canonicalizeJson,
  parseComposition,
  resolvePointer,
  validateSemantics,
  type CompositionProfile,
  type SemanticDeclaration,
  type StateField,
} from "@publisle/schema";
import { javascriptValue as js } from "./javascript.ts";

export interface CompositionInstance {
  readonly blockId: string;
  readonly contractDigest: string;
  readonly data: unknown;
  readonly semantics: SemanticDeclaration;
}
export interface PortConnection {
  readonly from: { readonly block: string; readonly port: string };
  readonly to: { readonly block: string; readonly port: string };
}
export interface CompositionCompilation {
  readonly documentDigest: string;
  readonly instances: readonly CompositionInstance[];
  readonly connections: readonly PortConnection[];
}
function digest(value: string): void {
  if (!/^sha256:[a-f0-9]{64}$/u.test(value))
    throw new Error("Expected immutable SHA-256 revision");
}
function check(field: StateField, variable: string): string {
  const clauses =
    field.type === "integer"
      ? [`typeof ${variable} === "number"`, `Number.isSafeInteger(${variable})`]
      : [`typeof ${variable} === ${js(field.type)}`];
  if (field.type === "number") clauses.push(`Number.isFinite(${variable})`);
  if (field.minimum !== undefined)
    clauses.push(`${variable} >= ${js(field.minimum)}`);
  if (field.maximum !== undefined)
    clauses.push(`${variable} <= ${js(field.maximum)}`);
  if (field.type === "string")
    clauses.push(
      `${variable}.length <= ${js(2 * (field.maxLength ?? 4096))}`,
      `Array.from(${variable}).length <= ${js(field.maxLength ?? 4096)}`,
      `!/[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]/u.test(${variable})`,
    );
  if (field.values) clauses.push(`${js(field.values)}.includes(${variable})`);
  return clauses.map((clause) => `(${clause})`).join(" && ");
}

function session(
  instance: CompositionInstance,
  profile: CompositionProfile,
  documentDigest: string,
): string {
  const initial = Object.fromEntries(
    profile.fields.map((field) => [
      field.id,
      resolvePointer(instance.data, field.binding).value,
    ]),
  );
  const read = (key: string): string => `state[${js(key)}]`;
  const assignment = (key: string, expression: string): string =>
    `${read(key)} = ${expression};`;
  const validators = profile.fields
    .map((field) => `case ${js(field.id)}: return ${check(field, "value")};`)
    .join("\n");
  const writable = profile.fields
    .filter((field) => field.writable)
    .map((field) => field.id);
  const shareable = profile.fields
    .filter((field) => field.shareable)
    .map((field) => field.id);
  const presetCases = profile.presets
    .map(
      (preset) =>
        `case ${js(preset.id)}: ${Object.entries(preset.values)
          .map(([key, value]) => assignment(key, js(value)))
          .join("\n")} return;`,
    )
    .join("\n");
  const operations = profile.operations
    .map((operation) => {
      switch (operation.kind) {
        case "assign":
          return `case ${js(operation.id)}: set(${js(operation.field)}, value); return;`;
        case "preset":
          return `case ${js(operation.id)}: preset(${js(operation.preset)}); return;`;
        case "transition":
          return `case ${js(operation.id)}: if (${read(operation.field)} !== ${js(operation.from)}) throw Error("Invalid transition"); ${assignment(operation.field, js(operation.to))} return;`;
      }
    })
    .join("\n");
  const inputs = profile.ports
    .filter((port) => port.direction === "input")
    .map(
      (port) =>
        `case ${js(port.id)}: ${port.presetSelection ? `if (!valid(${js(port.field)}, value)) throw Error("Invalid preset port"); preset(value);` : ""} set(${js(port.field)}, value); return;`,
    )
    .join("\n");
  const outputs = profile.ports
    .filter((port) => port.direction === "output")
    .map((port) => `case ${js(port.id)}: return ${read(port.field)};`)
    .join("\n");
  const views = profile.views
    .map((view) => `[${js(view.id)}]: ${read(view.field)}`)
    .join(",");
  const identity = {
    profile: "urn:publisle:snapshot:beta",
    documentDigest,
    contractDigest: instance.contractDigest,
    blockId: instance.blockId,
  };
  return `(() => {
    const authored = Object.freeze(${js(initial)});
    let state = {...authored};
    let disposed = false;
    function alive() { if (disposed) throw Error("Session disposed"); }
    function valid(key, value) { switch(key) { ${validators} default: return false; } }
    function set(key, value) { alive(); if (!${js(writable)}.includes(key) || !valid(key, value)) throw Error("Invalid writable state"); state[key] = value; }
    function preset(id) { alive(); switch(id) { ${presetCases} default: throw Error("Unknown preset"); } }
    return Object.freeze({
      authored,
      read() { alive(); return Object.freeze({...state}); },
      views() { alive(); return Object.freeze({${views}}); },
      action(id, value) { alive(); switch(id) { ${operations} default: throw Error("Unknown action"); } },
      preset,
      reset() { alive(); state = {...authored}; },
      receive(port, value) { alive(); switch(port) { ${inputs} default: throw Error("Unknown input port"); } },
      output(port) { alive(); switch(port) { ${outputs} default: throw Error("Unknown output port"); } },
      snapshot() { alive(); const result = Object.freeze({...${js(identity)}, state: Object.freeze({${shareable.map((key) => `[${js(key)}]: ${read(key)}`).join(",")}})}); snapshotBytes(result); return result; },
      restore(snapshot) {
        alive();
        plain(snapshot, ["profile", "documentDigest", "contractDigest", "blockId", "state"]);
        ${Object.entries(identity)
          .map(
            ([key, value]) =>
              `if (snapshot[${js(key)}] !== ${js(value)}) throw Error("Incompatible snapshot");`,
          )
          .join("\n")}
        plain(snapshot.state, ${js(shareable)});
        // Validate the complete candidate before any write; readonly values reset to authored.
        for (const key of ${js(shareable)}) if (!valid(key, snapshot.state[key])) throw Error("Invalid snapshot state");
        snapshotBytes(snapshot);
        state = {...authored, ...snapshot.state};
      },
      dispose() { disposed = true; state = {}; }
    });
  })()`;
}

/** Trusted build-time lowering. Returned ES module contains no schemas, graph, registry or interpreter. */
export function compileComposition(options: CompositionCompilation): string {
  canonicalizeJson(options);
  digest(options.documentDigest);
  if (options.instances.length > 128 || options.connections.length > 256)
    throw new Error("Composition size limit");
  const profiles = new Map<string, CompositionProfile>();
  for (const instance of options.instances) {
    digest(instance.contractDigest);
    if (
      !instance.blockId ||
      instance.blockId.length > 128 ||
      profiles.has(instance.blockId)
    )
      throw new Error("Invalid or duplicate block ID");
    const diagnostics = validateSemantics(instance.semantics, instance.data);
    if (diagnostics.length)
      throw new Error(diagnostics.map((entry) => entry.message).join("; "));
    profiles.set(
      instance.blockId,
      parseComposition(
        instance.semantics.composition,
        instance.data,
        instance.semantics.entities,
      ),
    );
  }
  const indegree = new Map([...profiles.keys()].map((key) => [key, 0]));
  const outgoing = new Map<string, PortConnection[]>();
  const edgeIds = new Set<string>();
  for (const connection of options.connections) {
    const source = profiles.get(connection.from.block);
    const target = profiles.get(connection.to.block);
    const from = source?.ports.find(
      (port) => port.id === connection.from.port && port.direction === "output",
    );
    const to = target?.ports.find(
      (port) => port.id === connection.to.port && port.direction === "input",
    );
    if (!source || !target || !from || !to)
      throw new Error("Missing block or typed port");
    if (
      source.fields.find((field) => field.id === from.field)?.type !==
      target.fields.find((field) => field.id === to.field)?.type
    )
      throw new Error("Port type mismatch");
    const key = canonicalizeJson(connection);
    if (edgeIds.has(key)) throw new Error("Duplicate connection");
    edgeIds.add(key);
    indegree.set(
      connection.to.block,
      (indegree.get(connection.to.block) ?? 0) + 1,
    );
    const edges = outgoing.get(connection.from.block) ?? [];
    edges.push(connection);
    outgoing.set(connection.from.block, edges);
  }
  const order: string[] = [];
  const ready = [...indegree.keys()]
    .filter((key) => indegree.get(key) === 0)
    .sort();
  while (ready.length) {
    const key = ready.shift();
    if (key === undefined) break;
    order.push(key);
    for (const edge of outgoing.get(key) ?? []) {
      const count = (indegree.get(edge.to.block) ?? 0) - 1;
      indegree.set(edge.to.block, count);
      if (count === 0) {
        ready.push(edge.to.block);
        ready.sort();
      }
    }
  }
  if (order.length !== profiles.size)
    throw new Error("Unsupported cross-block cycle");
  const propagation = order
    .map((key) => {
      const edges = [...(outgoing.get(key) ?? [])].sort((a, b) => {
        const left = canonicalizeJson(a);
        const right = canonicalizeJson(b);
        return left < right ? -1 : left > right ? 1 : 0;
      });
      return `if (changed.has(${js(key)})) { ${edges.map((edge) => `try { sessions[${js(edge.to.block)}].receive(${js(edge.to.port)}, sessions[${js(key)}].output(${js(edge.from.port)})); changed.add(${js(edge.to.block)}); } catch(error) { errors.push({block: ${js(edge.to.block)}, message: String(error)}); }`).join("\n")} }`;
    })
    .join("\n");
  return `// Generated bounded Publisle composition; host chooses storage, routing and presentation.
  function snapshotBytes(value) { if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 16384) throw Error("Snapshot exceeds 16 KiB"); }
  function notify(listener, views, signal) {
    return new Promise((resolve, reject) => {
      const stopped = () => finish(Error("Placement disposed"));
      const timer = setTimeout(() => finish(Error("Host observer timeout")), 1000);
      function finish(error) { clearTimeout(timer); signal.removeEventListener("abort", stopped); if(error) reject(error); else resolve(); }
      signal.addEventListener("abort", stopped, {once: true});
      Promise.resolve().then(() => { if(signal.aborted) throw Error("Placement disposed"); return listener(views, signal); }).then(() => finish(), finish);
    });
  }
  function plain(value, keys) {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length) throw Error("Expected plain data");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key)) || Object.values(descriptors).some(entry => !entry.enumerable || !("value" in entry))) throw Error("Unexpected snapshot fields or accessors");
  }
  export function createPlacement() {
    let disposed = false;
    const cancellation = new AbortController();
    let tail = Promise.resolve();
    const observers = new Map();
    const sessions = Object.freeze({${options.instances.map((instance) => `[${js(instance.blockId)}]: ${session(instance, profiles.get(instance.blockId)!, options.documentDigest)}`).join(",")}});
    return Object.freeze({
      session(id) { if (disposed || !Object.hasOwn(sessions, id)) throw Error("Unknown or disposed block"); return sessions[id]; },
      observe(id, listener) { if (disposed || !Object.hasOwn(sessions, id) || typeof listener !== "function") throw Error("Invalid host observer"); observers.set(id, listener); return () => { if (observers.get(id) === listener) observers.delete(id); }; },
      batch(commands) {
        if (!Array.isArray(commands) || commands.length > 128) return Promise.reject(Error("Batch size limit"));
        // Capture host input now, not after a queued asynchronous observer yields.
        const captured = commands.map(command => {
          plain(command, Object.hasOwn(command, "value") ? ["block", "kind", "id", "value"] : ["block", "kind", "id"]);
          if (typeof command.block !== "string" || typeof command.kind !== "string" || typeof command.id !== "string" || (Object.hasOwn(command, "value") && !["number", "string", "boolean"].includes(typeof command.value))) throw Error("Invalid host command");
          return {...command};
        });
        const run = async () => {
          if (disposed) throw Error("Placement disposed");
          const changed = new Set(); const errors = [];
          for (const command of captured) {
            try {
              if (!Object.hasOwn(sessions, command.block)) throw Error("Unknown block");
              const target = sessions[command.block];
              switch(command.kind) {
                case "action": target.action(command.id, command.value); break;
                case "preset": target.preset(command.id); break;
                case "reset": if(command.id !== "reset") throw Error("Unknown reset action"); target.reset(); break;
                default: throw Error("Unsupported command");
              }
              changed.add(command.block);
            } catch(error) { errors.push({block: command.block, message: String(error)}); }
          }
          ${propagation}
          // Host observers are out of band. Failures cannot stop other views or poison the queue.
          ${order.map((key) => `if (!disposed && changed.has(${js(key)}) && observers.has(${js(key)})) { try { await notify(observers.get(${js(key)}), sessions[${js(key)}].views(), cancellation.signal); } catch(error) { errors.push({block: ${js(key)}, message: String(error)}); } }`).join("\n")}
          return Object.freeze(errors.map(error => Object.freeze(error)));
        };
        const result = tail.then(run);
        tail = result.then(() => undefined, () => undefined);
        return result;
      },
      dispose() { if (disposed) return; disposed = true; cancellation.abort(); observers.clear(); ${order.map((key) => `sessions[${js(key)}].dispose();`).join("\n")} }
    });
  }`;
}
