import copy
import json
from pathlib import Path
import unittest
from citations import resolve_portable_citations
from html.parser import HTMLParser
from render import render_document, load_rendering_codes

ROOT = Path(__file__).resolve().parents[2]
CORPUS = json.loads((ROOT / "packages/contracts/fixtures/citations.json").read_text())


def comparable(result):
    result = dict(result)
    result["codes"] = sorted({item["code"] for item in result.pop("diagnostics")})
    return result


class IndependentCitations(unittest.TestCase):
    def test_shared_citeproc_generated_corpus(self):
        self.assertGreater(len(CORPUS["cases"]), 0)
        for style in ("numeric", "author-date"):
            for locale in ("en-US", "fr-FR"):
                self.assertTrue(any(case["style"] == style and case["locale"] == locale
                                    and case["expected"]["classification"] == "rendered" for case in CORPUS["cases"]))
        for case in CORPUS["cases"]:
            with self.subTest(case=case["name"]):
                source = copy.deepcopy(case["document"])
                result = resolve_portable_citations(source, case["style"], case["locale"])
                self.assertEqual(comparable(result), case["expected"])
                self.assertEqual(source, case["document"])

    def test_corpus_markers_and_reference_lists_reach_html(self):
        class CitationHTML(HTMLParser):
            def __init__(self):
                super().__init__()
                self.markers, self.references, self.current = [], [], None

            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag == "span" and attrs.get("class") == "publisle-citation":
                    self.markers.append("")
                    self.current = self.markers
                elif tag == "li":
                    self.references.append("")
                    self.current = self.references

            def handle_data(self, data):
                if self.current is not None:
                    self.current[-1] += data

            def handle_endtag(self, tag):
                if tag in ("span", "li"):
                    self.current = None

        registry = load_rendering_codes(ROOT / "packages/contracts/rendering-codes.json")
        for case in CORPUS["cases"]:
            with self.subTest(case=case["name"]):
                result = render_document(case["document"], "article", case["style"], case["locale"])
                expected = case["expected"]
                self.assertEqual(result["classification"], expected["classification"])
                self.assertEqual(sorted({item["code"] for item in result["diagnostics"]}), expected["codes"])
                self.assertTrue(all(item["code"] in registry for item in result["diagnostics"]))
                if expected["classification"] == "rejected":
                    self.assertEqual(result["html"], "")
                    continue
                self.assertEqual(result["capabilities"]["citations"], expected["capabilities"])
                html = CitationHTML()
                html.feed(result["html"])
                self.assertEqual(html.markers, expected["citations"])
                self.assertEqual(html.references, [item["text"] for item in expected["bibliography"]])


if __name__ == "__main__":
    unittest.main()
