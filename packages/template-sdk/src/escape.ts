export function latexText(value: string): string {
  const escapes: Readonly<Record<string, string>> = {
    "\\": "\\textbackslash{}",
    "&": "\\&",
    "%": "\\%",
    $: "\\$",
    "#": "\\#",
    _: "\\_",
    "{": "\\{",
    "}": "\\}",
    "~": "\\textasciitilde{}",
    "^": "\\textasciicircum{}",
  };
  return value.replace(
    /[\\&%$#_{}~^]/gu,
    (character) => escapes[character] ?? character,
  );
}

export function latexKey(value: string): string {
  if (
    /^[A-Za-z][A-Za-z0-9:.-]*$/u.test(value) &&
    !value.startsWith("publisle-key-")
  )
    return value;
  return `publisle-key-${Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
