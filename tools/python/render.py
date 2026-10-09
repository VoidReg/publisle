"""Independent Publisle v1 static HTML subset. Requires Python only, never Node.

Supported: core prose, rich text, direction, figures, tables, labels, authored
notes and numeric references. Math, interactive and custom blocks use readable
fallback with diagnostics. Does not execute plugins, migrations or full CSL.
"""
from html import escape
import re


def render_document(document, instance_id="article"):
    if document.get("schemaVersion") != 1 or not isinstance(document.get("blocks"), list):
        raise ValueError("Expected a Publisle schemaVersion 1 document")
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", instance_id):
        raise ValueError("instance_id must be a safe HTML identifier")
    diagnostics, labels, notes, references, cited = [], {}, {}, {}, {}
    blocks = document["blocks"]

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

    def attr(value):
        return escape(str(value), quote=True)

    def safe_url(value):
        return "" if re.match(r"(javascript|vbscript|data):", re.sub(r"[\x00-\x20]", "", value), re.I) else value

    def inline(nodes, block):
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
                diagnostic(block, "python-math-fallback", "Math is preserved as source text.")
                result.append("<code>" + escape(node["value"]) + "</code>")
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
                diagnostic(block, "python-inline-fallback", "Unsupported inline content uses readable text.")
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
                diagnostic(block, "python-readable-binding", "Readable binding cannot be resolved.")
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
        if block.get("schemaVersion") != 1:
            diagnostic(block, "python-unsupported-version", "No migrations execute in Python.")
            body.append(readable_flow(block))
            continue
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
                rows.append("<tr>" + "".join(f'<{tag}>' + inline(cell, block) + f'</{tag}>' for cell in row) + "</tr>")
            body.append(f'<table{label}><caption>' + flow(data.get("caption", []), block) + "</caption><tbody>" + "".join(rows) + "</tbody></table>")
        elif kind == "publisle:footnote":
            body.append(f'<aside id="{attr(identifier(data["identifier"], "note"))}">' + flow(data.get("children", []), block) + "</aside>")
        elif kind == "publisle:bibliography":
            bibliography_present = True
        else:
            diagnostic(block, "python-block-fallback", "Unsupported math, interactive or custom behavior uses readable fallback.")
            readable = block.get("readable", {})
            body.append(flow(data.get("fallback", []), block) or readable_flow(block) or "<p>" + escape(data.get("alt", data.get("value", readable.get("text", "")))) + "</p>")
    if bibliography_present or cited:
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
    return {"html": f'<article{language} dir="{direction}">' + "".join(body) + "</article>", "diagnostics": diagnostics, "capabilities": {"role": "static-renderer", "schemaVersion": 1, "fullCSL": False, "plugins": False, "migrations": False}}


def main():
    import argparse
    import json
    from pathlib import Path
    from publisle import parse_json
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--instance-id", default="article")
    args = parser.parse_args()
    print(json.dumps(render_document(parse_json(args.source.read_bytes()), args.instance_id), ensure_ascii=False))


if __name__ == "__main__":
    main()
