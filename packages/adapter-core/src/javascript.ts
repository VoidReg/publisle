/** Build-time JSON embedding. Object literals give __proto__ special semantics; JSON does not. */
export function javascriptValue(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error("Cannot emit a non-JSON value.");
  const code = json.includes('"__proto__":')
    ? `/*#__PURE__*/JSON.parse(${JSON.stringify(json)})`
    : json;
  return code.replaceAll("<", "\\u003c");
}
