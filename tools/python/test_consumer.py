"""Offline tests: python3 -B -m unittest discover -s tools/python -v."""

from pathlib import Path
import unittest

from publisle import ConsumerError, canonicalize, digest, parse_json, validate_structure

ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = ROOT / "packages/contracts"


def load(path):
    return parse_json(path.read_bytes())


class SharedConformance(unittest.TestCase):
    def test_jcs(self):
        for case in load(CONTRACTS / "fixtures/canonical.json"):
            with self.subTest(case=case["id"]):
                value = parse_json(case["text"])
                self.assertEqual(canonicalize(value).decode(), case["canonical"])
                self.assertEqual(digest(value), case["digest"])

    def test_invalid_json(self):
        for case in load(CONTRACTS / "fixtures/invalid-json.json"):
            with self.subTest(case=case["id"]):
                source = bytes(int(v) for v in case["bytes"]) if "bytes" in case else case["text"]
                with self.assertRaises(ConsumerError) as caught:
                    parse_json(source)
                self.assertEqual(caught.exception.code, case["code"])

    def test_structural(self):
        schemas = {path.stem: load(path) for path in (CONTRACTS / "schemas").glob("*.json")}
        for case in load(CONTRACTS / "fixtures/structural.json"):
            with self.subTest(case=case["id"]):
                schema = schemas[case["schema"]]
                result = validate_structure(case["value"], schema,
                                            [v for v in schemas.values() if v is not schema])
                self.assertEqual(result["valid"], case["valid"], result)
                if not result["valid"]:
                    self.assertEqual(result["diagnostics"][0]["code"], "invalid-data", result)

    def test_boundary_limits(self):
        for value in ("[" * 150 + "0" + "]" * 150, '"' + "a" * (2 * 1024 * 1024) + '"', "[" + "0," * 100_000 + "0]"):
            with self.assertRaises(ConsumerError) as caught:
                parse_json(value)
            self.assertEqual(caught.exception.code, "json-limit-exceeded")
        for value in (float("inf"), {"x": object()}, "\ud800"):
            with self.assertRaises(ConsumerError):
                canonicalize(value)
        value = []
        value.append(value)
        with self.assertRaises(ConsumerError):
            canonicalize(value)

    def test_no_mutation(self):
        value = {}
        schema = {"type": "object", "properties": {"x": {"type": "integer", "default": 4}}, "additionalProperties": False}
        self.assertTrue(validate_structure(value, schema)["valid"])
        self.assertEqual(value, {})
        self.assertFalse(validate_structure({"x": "4"}, schema)["valid"])
        self.assertFalse(validate_structure({"extra": True}, schema)["valid"])

    def test_productive_recursion(self):
        schema = {"$id": "urn:test:recursive", "anyOf": [{"type": "null"}, {"type": "array", "items": {"$ref": "urn:test:recursive"}}]}
        self.assertTrue(validate_structure([None, [None]], schema)["valid"])
        self.assertEqual(validate_structure(1, {"$ref": "#"})["diagnostics"][0]["code"], "unsupported-contract")

    def test_classifications(self):
        for schema in ({"required": 5}, {"type": "unknown"}, {"items": 2}, {"maximum": True}):
            self.assertEqual(validate_structure(None, schema)["diagnostics"][0]["code"], "invalid-contract")
        for schema in ({"unevaluatedProperties": False}, {"pattern": "(a+)+$"}, {"$ref": "https://example.invalid/schema"},
                       {"$schema": "https://example.invalid/dialect"}, {"$id": "relative.json"},
                       {"$vocabulary": {"https://json-schema.org/draft/2020-12/vocab/format-assertion": True}},
                       {"anyOf": [True] * 17}):
            self.assertEqual(validate_structure(None, schema)["diagnostics"][0]["code"], "unsupported-contract")
        self.assertTrue(validate_structure("not-a-date", {"type": "string", "format": "date-time"})["valid"])
        self.assertFalse(validate_structure(True, {"const": 1})["valid"])
        self.assertTrue(validate_structure(None, {"$defs": {"yes": True}, "$ref": "#/$defs/yes"})["valid"])
        self.assertFalse(validate_structure(None, {"$defs": {"no": False}, "$ref": "#/$defs/no"})["valid"])


if __name__ == "__main__":
    unittest.main()
