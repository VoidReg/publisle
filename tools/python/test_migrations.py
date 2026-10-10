import json
from pathlib import Path
import unittest
from migrations import (
    CURRENT_BLOCK_VERSIONS,
    KNOWN_PORTABLE_MIGRATIONS,
    migrate_block,
    migrate_document,
)

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = json.loads((ROOT / "packages/contracts/fixtures/migrations.json").read_text())


class PortableMigrations(unittest.TestCase):
    def test_matches_shared_fixture_expectations(self):
        for case in FIXTURE["cases"]:
            version, data, migrated = migrate_block(case["type"], case["from"], case["input"])
            self.assertEqual(version, case["to"], case["name"])
            self.assertEqual(data, case["expected"], case["name"])
            self.assertTrue(migrated, case["name"])

    def test_registers_the_schematic_migration_only(self):
        self.assertEqual(
            set(KNOWN_PORTABLE_MIGRATIONS),
            {("publisle:interactive-schematic", 1)},
        )
        self.assertEqual(CURRENT_BLOCK_VERSIONS["publisle:interactive-schematic"], 2)

    def test_portable_reader_binary64_versions_migrate(self):
        from publisle import parse_json
        source = parse_json(b'{"schemaVersion":1,"blocks":[{"id":"a","type":"publisle:interactive-schematic","schemaVersion":1,"data":{"alt":"Counter"}}]}')
        migrated, report = migrate_document(source)
        self.assertEqual(report, {"a": "migrated"})
        self.assertEqual(migrated["blocks"][0]["data"], {"accessibility": {"label": "Counter"}})
        self.assertEqual(source["blocks"][0]["data"], {"alt": "Counter"})

    def test_unsupported_document_versions_do_not_migrate(self):
        with self.assertRaises(ValueError):
            migrate_document({"schemaVersion": 2, "blocks": []})

    def test_unknown_types_and_versions_are_refused_unchanged(self):
        version, data, migrated = migrate_block("example:widget", 1, {"a": 1})
        self.assertEqual((version, data, migrated), (1, {"a": 1}, False))
        version, data, migrated = migrate_block("publisle:interactive-schematic", 2, {})
        self.assertEqual((version, data, migrated), (2, {}, False))
        version, data, migrated = migrate_block("publisle:interactive-schematic", 3, {})
        self.assertEqual((version, data, migrated), (3, {}, False))

    def test_document_migration_reports_classification(self):
        document = {
            "schemaVersion": 1,
            "blocks": [
                {"id": "a", "type": "publisle:interactive-schematic", "schemaVersion": 1, "data": {"alt": "X"}},
                {"id": "b", "type": "publisle:interactive-schematic", "schemaVersion": 2, "data": {}},
                {"id": "c", "type": "example:widget", "schemaVersion": 9, "data": {}},
            ],
        }
        migrated, report = migrate_document(document)
        self.assertEqual(
            report,
            {"a": "migrated", "b": "current", "c": "unsupported"},
        )
        self.assertEqual(migrated["blocks"][0]["data"], {"accessibility": {"label": "X"}})
        self.assertEqual(migrated["blocks"][0]["schemaVersion"], 2)
        # The source document is never mutated.
        self.assertEqual(document["blocks"][0]["data"], {"alt": "X"})


if __name__ == "__main__":
    unittest.main()
