from pathlib import Path
import json
import re
import unittest
from render import render_document, load_rendering_codes, MathError, mathml

ROOT = Path(__file__).resolve().parents[2]


def normalize_mathml(mathml_string):
    return (
        re.sub(r"<annotation[\s\S]*?</annotation>", "", mathml_string)
        .replace("<semantics>", "")
        .replace("</semantics>", "")
        .replace(">\s+<", "><")
        .strip()
    )


class IndependentRendering(unittest.TestCase):
    def test_shared_portable_fixture(self):
        source = json.loads((ROOT / "packages/contracts/fixtures/static-rendering.json").read_text())
        result = render_document(source, "one")
        self.assertEqual(result["diagnostics"], [])
        for text in ("Portable methods", "مرحبا", "Measured figure", "Results table", "Authored research note"):
            self.assertIn(text, result["html"])
        self.assertIn('href="#one-label-methods"', result["html"])
        self.assertIn('href="#one-note-1"', result["html"])
        self.assertIn('<th>Sample</th>', result["html"])
        self.assertNotIn('id="one-', render_document(source, "two")["html"])

    def test_shared_mathml_expectations(self):
        source = json.loads((ROOT / "packages/contracts/fixtures/static-rendering.json").read_text())
        expectations = json.loads(
            (ROOT / "packages/contracts/fixtures/static-rendering-mathml.json").read_text()
        )["expectations"]
        result = render_document(source, "one")
        produced = [normalize_mathml(found) for found in re.findall(r"<math[\s\S]*?</math>", result["html"])]
        expected = [normalize_mathml(entry["mathml"]) for entry in expectations]
        self.assertEqual(produced, expected)
        for entry in expectations:
            self.assertEqual(mathml(entry["tex"], entry["display"]), entry["mathml"])

    def test_emits_only_registered_shared_codes(self):
        registry = load_rendering_codes(ROOT / "packages/contracts/rendering-codes.json")
        source = {"schemaVersion": 1, "blocks": [
            {"id": "b1", "type": "publisle:math", "schemaVersion": 1, "data": {"value": "\\frac{a", "display": True}},
            {"id": "b2", "type": "example:widget", "schemaVersion": 1, "data": {"fallback": []}},
            {"id": "b3", "type": "publisle:paragraph", "schemaVersion": 2, "data": {}},
        ]}
        result = render_document(source)
        self.assertEqual(
            {item["code"] for item in result["diagnostics"]},
            {"invalid-math", "fallback-readable", "unsupported-block-version"},
        )
        self.assertTrue(set(item["code"] for item in result["diagnostics"]).issubset(registry))
        self.assertIn('class="publisle-math-error"', result["html"])
        self.assertIn("\\frac{a", result["html"])

    def test_escapes_source_and_rejects_executable_urls(self):
        source = {"schemaVersion":1,"blocks":[{"id":"fixture","type":"publisle:paragraph","schemaVersion":1,"data":{"content":[{"type":"text","value":"<script>bad</script>"},{"type":"link","url":"java\nscript:alert(1)","children":[{"type":"text","value":"Click"}]}]}}]}
        result = render_document(source)
        self.assertIn("&lt;script&gt;", result["html"])
        self.assertIn('href=""', result["html"])

    def test_declares_capability_limits(self):
        source = {"schemaVersion":1,"blocks":[{"id":"custom","type":"example:widget","schemaVersion":1,"data":{"fallback":[{"type":"paragraph","content":[{"type":"text","value":"Readable fallback"}]}]}}]}
        result = render_document(source)
        self.assertEqual(len(result["diagnostics"]), 1)
        self.assertEqual(result["diagnostics"][0]["code"], "fallback-readable")
        self.assertIn("Readable fallback", result["html"])
        self.assertFalse(result["capabilities"]["plugins"])

    def test_mathml_converter_rejects_out_of_subset_input(self):
        for tex in ("\\unknown", "x^", "{a", "a}"):
            with self.assertRaises(MathError):
                mathml(tex, False)


if __name__ == "__main__":
    unittest.main()
