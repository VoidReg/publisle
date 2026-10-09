from pathlib import Path
import json
import unittest
from render import render_document

ROOT = Path(__file__).resolve().parents[2]

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

    def test_escapes_source_and_rejects_executable_urls(self):
        source = {"schemaVersion":1,"blocks":[{"id":"fixture","type":"publisle:paragraph","schemaVersion":1,"data":{"content":[{"type":"text","value":"<script>bad</script>"},{"type":"link","url":"java\nscript:alert(1)","children":[{"type":"text","value":"Click"}]}]}}]}
        result = render_document(source)
        self.assertIn("&lt;script&gt;", result["html"])
        self.assertIn('href=""', result["html"])

    def test_declares_math_and_custom_fallback_limits(self):
        source = {"schemaVersion":1,"blocks":[{"id":"math","type":"publisle:math","schemaVersion":1,"data":{"value":"x^2"}},{"id":"custom","type":"example:widget","schemaVersion":1,"data":{"fallback":[{"type":"paragraph","content":[{"type":"text","value":"Readable fallback"}]}]}}]}
        result = render_document(source)
        self.assertEqual(len(result["diagnostics"]), 2)
        self.assertIn("Readable fallback", result["html"])
        self.assertFalse(result["capabilities"]["plugins"])

if __name__ == "__main__":
    unittest.main()
