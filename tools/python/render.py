"""Independent Publisle v1 static HTML subset. Requires Python only, never Node.

Supported: core prose, rich text, direction, figures, tables, labels, authored
notes, numeric references and presentation MathML for the shared TeX subset.
Out-of-subset math, interactive and custom blocks use readable fallback with
shared diagnostics. Executes only the built-in portable migration, never plugins
or host migrations; full CSL is outside this renderer's role.
"""
from html import escape
import re

from migrations import (
    CURRENT_BLOCK_VERSIONS,
    migrate_block,
)

MATHML_NS = " xmlns=\"http://www.w3.org/1998/Math/MathML\""

GREEK = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ",
    "epsilon": "ϵ", "zeta": "ζ", "eta": "η", "theta": "θ",
    "iota": "ι", "kappa": "κ", "lambda": "λ", "mu": "μ",
    "nu": "ν", "xi": "ξ", "pi": "π", "rho": "ρ",
    "sigma": "σ", "tau": "τ", "upsilon": "υ", "phi": "ϕ",
    "chi": "χ", "psi": "ψ", "omega": "ω",
}
OPERATORS = {
    "+": "+", "-": "−", "=": "=",
    "times": "×", "div": "÷", "cdot": "⋅", "pm": "±",
    "leq": "≤", "geq": "≥", "approx": "≈", "to": "→",
}
CHARACTER_OPERATORS = {"+": "+", "-": "−", "=": "=", "(": "(", ")": ")", ",": ","}


class MathError(ValueError):
    pass


def tokenize_math(tex):
    tokens = []
    i = 0
    while i < len(tex):
        ch = tex[i]
        if ch.isspace():
            i += 1
        elif ch == "\\":
            j = i + 1
            while j < len(tex) and tex[j].isalpha():
                j += 1
            if j == i + 1:
                raise MathError("lone backslash")
            tokens.append("\\" + tex[i + 1:j])
            i = j
        elif ch in "{}^_":
            tokens.append(ch)
            i += 1
        else:
            tokens.append(ch)
            i += 1
    return tokens


def wrap_math(children):
    if len(children) == 1:
        return children[0]
    return "<mrow>" + "".join(children) + "</mrow>"


def parse_math_atom(tokens, i):
    if i >= len(tokens):
        raise MathError("unexpected end of input")
    token = tokens[i]
    if token == "{":
        children, i = parse_math_sequence(tokens, i + 1, True)
        return i + 1, wrap_math(children)
    if token == "}":
        raise MathError("unmatched }")
    if token in ("^", "_"):
        raise MathError("script marker without a base")
    if token.startswith("\\"):
        name = token[1:]
        if name == "frac":
            i, numerator = parse_math_atom(tokens, i + 1)
            i, denominator = parse_math_atom(tokens, i)
            return i, "<mfrac>" + numerator + denominator + "</mfrac>"
        if name == "sqrt":
            i, body = parse_math_atom(tokens, i + 1)
            return i, "<msqrt>" + body + "</msqrt>"
        if name in GREEK:
            return i + 1, "<mi>" + GREEK[name] + "</mi>"
        if name in OPERATORS:
            return i + 1, "<mo>" + OPERATORS[name] + "</mo>"
        raise MathError("unsupported command \\" + name)
    if token in CHARACTER_OPERATORS:
        return i + 1, "<mo>" + CHARACTER_OPERATORS[token] + "</mo>"
    if token.isdigit():
        j = i
        while j < len(tokens) and tokens[j].isdigit():
            j += 1
        return j, "<mn>" + "".join(tokens[i:j]) + "</mn>"
    if token.isalpha():
        return i + 1, "<mi>" + escape(token) + "</mi>"
    raise MathError("unsupported character " + repr(token))


def parse_math_sequence(tokens, i, in_group):
    children = []
    while i < len(tokens):
        token = tokens[i]
        if token == "}":
            if in_group:
                return children, i
            raise MathError("unmatched }")
        i, atom = parse_math_atom(tokens, i)
        while i < len(tokens) and tokens[i] in ("^", "_"):
            kind = tokens[i]
            i, script = parse_math_atom(tokens, i + 1)
            tag = "msup" if kind == "^" else "msub"
            atom = "<" + tag + ">" + atom + script + "</" + tag + ">"
        children.append(atom)
    if in_group:
        raise MathError("unclosed {")
    return children, i


def mathml(tex, display):
    children, _ = parse_math_sequence(tokenize_math(tex), 0, False)
    attr = MATHML_NS + (' display="block"' if display else "")
    return "<math" + attr + "><mrow>" + "".join(children) + "</mrow></math>"


def load_rendering_codes(path):
    import json
    with open(path, "r", encoding="utf-8") as handle:
        document = json.load(handle)
    if document.get("format") != "publisle:rendering-codes":
        raise ValueError("Expected publisle:rendering-codes")
    return set(document["codes"])


def render_document(document, instance_id="article", citation_style=None, citation_locale="en-US"):
    citation_result = None
    citation_index = 0
    if citation_style is not None:
        from citations import resolve_portable_citations
        citation_result = resolve_portable_citations(document, citation_style, citation_locale)
        if citation_result["classification"] == "rejected":
            return {"html": "", "diagnostics": citation_result["diagnostics"],
                    "capabilities": capabilities(citation_result), "classification": "rejected"}
    if not isinstance(document.get("blocks"), list):
        raise ValueError("Expected a Publisle schemaVersion 1 document")
    if document.get("schemaVersion") != 1:
        return {"html": "", "diagnostics": [{
            "code": "unsupported-document-version",
            "message": "This document version requires an unsupported conversion.",
        }], "capabilities": capabilities(), "classification": "rejected"}
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", instance_id):
        raise ValueError("instance_id must be a safe HTML identifier")
    diagnostics, labels, notes, references, cited = [], {}, {}, {}, {}
    if citation_result is not None:
        diagnostics.extend(citation_result["diagnostics"])
    # Migrate before resolving readable bindings or collecting labels/references.
    # Keep source data immutable, including nested objects.
    from copy import deepcopy
    blocks = deepcopy(document["blocks"])
    for block in blocks:
        version, data, migrated = migrate_block(
            block["type"], block.get("schemaVersion"), block.get("data", {})
        )
        if migrated:
            block["schemaVersion"], block["data"] = version, data
        current = CURRENT_BLOCK_VERSIONS.get(block["type"], 1)
        if block.get("schemaVersion") != current:
            return {"html": "", "diagnostics": [{
                "code": "unsupported-block-version", "blockId": block["id"],
                "message": "This block version has no portable migration.",
            }], "capabilities": capabilities(), "classification": "rejected"}

    def identifier(value, kind="label"):
        value = str(value)
        safe = value if re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.:-]*", value) and not value.startswith("encoded-") else "encoded-" + value.encode("utf-8").hex()
        return instance_id + "-" + kind + "-" + safe

    for block in blocks:
        data = block.get("data", {})
        if data.get("label"):
            label = data["label"]
            if label in labels:
                raise ValueError("Duplicate label: " + label)
            labels[label] = identifier(label)
        if block["type"] == "publisle:footnote":
            key = data["identifier"]
            if key in notes:
                raise ValueError("Duplicate note: " + key)
            notes[key] = data
        if block["type"] == "publisle:bibliography":
            for entry in data.get("entries", []):
                if entry["id"] not in references:
                    references[entry["id"]] = entry

    def diagnostic(block, code, message):
        diagnostics.append({"code": code, "message": message, "blockId": block["id"]})

    def math_node(value, display, block):
        try:
            return mathml(str(value), display)
        except MathError as error:
            diagnostic(block, "invalid-math", "Math could not be rendered: " + str(error))
            tag = "pre" if display else "code"
            return f'<{tag} class="publisle-math-error">{escape(str(value))}</{tag}>'

    def attr(value):
        return escape(str(value), quote=True)

    def safe_url(value):
        return "" if re.match(r"(javascript|vbscript|data):", re.sub(r"[\x00-\x20]", "", value), re.I) else value

    def inline(nodes, block):
        nonlocal citation_index
        result = []
        for node in nodes:
            kind = node.get("type")
            if kind == "text":
                text = escape(node.get("value", ""))
                direction = node.get("direction")
                result.append(f'<bdi dir="{direction}">{text}</bdi>' if direction in ("rtl", "ltr", "auto") else text)
            elif kind in ("strong", "emphasis", "strikethrough"):
                tag = {"strong": "strong", "emphasis": "em", "strikethrough": "s"}[kind]
                result.append(f'<{tag}>{inline(node.get("children", []), block)}</{tag}>')
            elif kind == "inlineCode":
                result.append("<code>" + escape(node["value"]) + "</code>")
            elif kind == "link":
                result.append(f'<a href="{attr(safe_url(node["url"]))}">{inline(node.get("children", []), block)}</a>')
            elif kind == "inlineImage":
                result.append(f'<img src="{attr(safe_url(node["url"]))}" alt="{attr(node.get("alt", ""))}">')
            elif kind in ("hardBreak", "softBreak"):
                result.append("<br>" if kind == "hardBreak" else " ")
            elif kind == "inlineMath":
                result.append(math_node(node.get("value", ""), False, block))
            elif kind == "crossReference":
                target = labels.get(node["target"])
                text = inline(node.get("children", []), block) or escape(node["target"])
                if target:
                    result.append(f'<a href="#{attr(target)}">{text}</a>')
                else:
                    diagnostic(block, "unresolved-reference", "Missing label " + node["target"])
                    result.append(text)
            elif kind == "footnoteReference":
                key = node["identifier"]
                if key not in notes:
                    diagnostic(block, "unresolved-footnote", "Missing note " + key)
                result.append(f'<sup><a href="#{attr(identifier(key, "note"))}">{escape(key)}</a></sup>')
            elif kind == "citationReference":
                if citation_result is not None:
                    marker = citation_result["citations"][citation_index]
                    citation_index += 1
                    result.append('<span class="publisle-citation">' + escape(marker) + '</span>')
                    continue
                numbers = []
                for item in node["items"]:
                    key = item["id"]
                    if key not in references:
                        diagnostic(block, "unresolved-citation", "Missing reference " + key)
                        numbers.append(escape(key))
                    else:
                        cited.setdefault(key, len(cited) + 1)
                        locator = ", " + escape(item["locator"]) if item.get("locator") else ""
                        numbers.append(f'<a href="#{attr(identifier(key, "ref"))}">{cited[key]}{locator}</a>')
                result.append(escape(node.get("prefix", "")) + "[" + ", ".join(numbers) + "]" + escape(node.get("suffix", "")))
            else:
                diagnostic(block, "fallback-inline", "Unsupported inline content uses readable text.")
                result.append(escape(node.get("value", "")))
        return "".join(result)

    def flow(nodes, block):
        result = []
        for node in nodes:
            if node.get("type") == "paragraph":
                result.append("<p>" + inline(node.get("content", []), block) + "</p>")
            elif node.get("type") == "list":
                tag = "ol" if node.get("ordered") else "ul"
                result.append(f'<{tag}>' + "".join("<li>" + flow(item.get("children", []), block) + "</li>" for item in node.get("items", [])) + f'</{tag}>')
            else:
                result.append(flow(node.get("children", []), block))
        return "".join(result)

    def readable_flow(block):
        readable = block.get("readable", {})
        content = readable.get("content", {})
        if "binding" in readable:
            content = block.get("data", {})
            try:
                for part in readable["binding"].split("/")[1:]:
                    key = part.replace("~1", "/").replace("~0", "~")
                    content = content[int(key)] if isinstance(content, list) else content[key]
            except (KeyError, IndexError, ValueError, TypeError):
                diagnostic(block, "unresolved-readable-binding", "Readable binding cannot be resolved.")
                return ""
        result = inline(content.get("title", []), block)
        for key in ("description", "instructions", "purpose", "observations", "assumptions", "fallback"):
            result += flow(content.get(key, []), block)
        return result

    body = []
    bibliography_present = False
    for block in blocks:
        kind, data = block["type"], block.get("data", {})
        label = f' id="{attr(labels[data["label"]])}"' if data.get("label") else ""
        if kind == "publisle:heading":
            level = int(min(6, max(1, data.get("level", 1))))
            body.append(f'<h{level}{label}>' + inline(data.get("content", []), block) + f'</h{level}>')
        elif kind == "publisle:paragraph":
            body.append(f'<p{label}>' + inline(data.get("content", []), block) + "</p>")
        elif kind == "publisle:list":
            body.append(flow([{"type": "list", **data}], block))
        elif kind in ("publisle:quote", "publisle:callout"):
            body.append("<blockquote>" + flow(data.get("children", []), block) + "</blockquote>")
        elif kind == "publisle:code":
            body.append("<pre><code>" + escape(data.get("value", "")) + "</code></pre>")
        elif kind == "publisle:figure":
            body.append(f'<figure{label}><img src="{attr(safe_url(data["src"]))}" alt="{attr(data.get("alt", ""))}"><figcaption>' + flow(data.get("caption", []), block) + "</figcaption></figure>")
        elif kind == "publisle:table":
            rows = []
            for i, row in enumerate(data.get("rows", [])):
                tag = "th" if i < data.get("headerRows", 1) else "td"
                scope = ' scope="col"' if tag == "th" else ""
                rows.append("<tr>" + "".join(f'<{tag}{scope}>' + inline(cell, block) + f'</{tag}>' for cell in row) + "</tr>")
            body.append(f'<table{label}><caption>' + flow(data.get("caption", []), block) + "</caption><tbody>" + "".join(rows) + "</tbody></table>")
        elif kind == "publisle:math":
            body.append(math_node(data.get("value", ""), bool(data.get("display")), block))
        elif kind == "publisle:footnote":
            body.append(f'<aside id="{attr(identifier(data["identifier"], "note"))}">' + flow(data.get("children", []), block) + "</aside>")
        elif kind == "publisle:bibliography":
            bibliography_present = True
        else:
            # Interactive and unknown blocks: TypeScript renders authored
            # fallback prose without a diagnostic and warns only when nothing
            # readable exists; the Python renderer classifies identically.
            readable = block.get("readable", {})
            content = data.get("content") if isinstance(data.get("content"), dict) else {}
            has_authored = bool(data.get("fallback"))
            has_description = bool(content.get("description"))
            rendered = (flow(data.get("fallback", []), block) if has_authored else "") or readable_flow(block)
            if rendered or has_authored or has_description:
                body.append(rendered)
            else:
                diagnostic(block, "missing-static-representation", "The block has no static representation or readable fallback.")
                body.append(rendered)
    if citation_result is not None:
        items = [f'<li id="{attr(identifier(entry["id"], "ref"))}" value="{attr(entry["label"])}">{escape(entry["text"])}</li>'
                 for entry in citation_result["bibliography"]]
        if bibliography_present or items:
            # CSL text already contains any style-prescribed numbering.
            body.append('<ol class="publisle-references" style="list-style: none">' + "".join(items) + '</ol>')
    elif bibliography_present or cited:
        items = []
        for key, number in cited.items():
            entry = references[key]
            text = ". ".join(filter(None, [", ".join(entry.get("authors", [])), entry.get("title"), entry.get("issued")])) or entry.get("raw", key)
            items.append(f'<li id="{attr(identifier(key, "ref"))}" value="{number}">{escape(text)}</li>')
        body.append("<ol class=\"publisle-references\">" + "".join(items) + "</ol>")
    metadata = document.get("metadata", {})
    language = f' lang="{attr(metadata["language"])}"' if metadata.get("language") else ""
    direction = metadata.get("direction", "auto")
    if direction not in ("ltr", "rtl", "auto"):
        raise ValueError("Invalid document direction")
    return {"html": f'<article{language} dir="{direction}">' + "".join(body) + "</article>", "diagnostics": diagnostics, "capabilities": capabilities(citation_result), "classification": "fallback-with-diagnostic" if diagnostics else "rendered"}


def capabilities(citation_result=None):
    result = {"role": "static-renderer", "schemaVersion": 1, "fullCSL": False,
              "plugins": False, "migrations": "builtin-portable"}
    if citation_result is not None:
        result["citations"] = citation_result["capabilities"]
    return result


def main():
    import argparse
    import json
    from pathlib import Path
    from publisle import parse_json
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--instance-id", default="article")
    parser.add_argument("--citation-style", default=None,
                        help="Opt into the shared Research numeric/author-date subset")
    parser.add_argument("--citation-locale", default="en-US")
    parser.add_argument("--codes", type=Path, default=None,
                        help="publisle:rendering-codes registry to validate emitted codes against")
    args = parser.parse_args()
    result = render_document(parse_json(args.source.read_bytes()), args.instance_id,
                             args.citation_style, args.citation_locale)
    if args.codes:
        allowed = load_rendering_codes(args.codes)
        unknown = sorted({item["code"] for item in result["diagnostics"]} - allowed)
        if unknown:
            raise SystemExit("Diagnostic codes outside the shared registry: " + ", ".join(unknown))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
