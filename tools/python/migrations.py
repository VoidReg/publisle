"""Portable built-in block migrations, independent of Node and TypeScript.

This module ports the small declarative migration set that the TypeScript
implementation applies during preparation. It contains no plugin code, no
callbacks and no network access. Executable or host-supplied migrations are
implementation-bound by design; they are reported as unsupported, never
guessed or executed.
"""

CURRENT_BLOCK_VERSIONS = {
    "publisle:interactive-schematic": 2,
}


def migrate_interactive_envelope_v1_to_v2(data):
    """Port of migrateInteractiveEnvelope: legacy `alt` becomes `accessibility.label`."""
    if not isinstance(data, dict):
        return data
    rest = {key: value for key, value in data.items() if key != "alt"}
    alt = data.get("alt")
    if not isinstance(alt, str):
        return rest
    accessibility = {}
    existing = rest.get("accessibility")
    if isinstance(existing, dict):
        accessibility.update(existing)
    if "label" not in accessibility:
        accessibility["label"] = alt
    return {**rest, "accessibility": accessibility}


KNOWN_PORTABLE_MIGRATIONS = {
    ("publisle:interactive-schematic", 1): (2, migrate_interactive_envelope_v1_to_v2),
}


def migrate_block(block_type, version, data):
    """Apply a known portable migration.

    Returns (version, data, migrated). Unknown combinations return the input
    unchanged with migrated=False; the caller decides the diagnostic.
    """
    entry = KNOWN_PORTABLE_MIGRATIONS.get((block_type, version))
    if entry is None:
        return version, data, False
    to_version, migrate = entry
    return to_version, migrate(data), True


def migrate_document(document):
    """Apply known portable migrations across a document copy.

    Returns (new_document, report) where report maps block id to one of
    "migrated", "current", or "unsupported". The input is never mutated.
    """
    if (not isinstance(document, dict) or document.get("schemaVersion") != 1
            or not isinstance(document.get("blocks"), list)):
        raise ValueError("Expected a Publisle schemaVersion 1 document")
    blocks = []
    report = {}
    for block in document["blocks"]:
        block_type = block.get("type")
        version = block.get("schemaVersion")
        new_block = dict(block)
        # The portable JSON reader represents all numbers as binary64 floats.
        if (isinstance(version, bool) or not isinstance(version, (int, float))
                or version < 1 or version != int(version)):
            report[block.get("id")] = "unsupported"
            blocks.append(new_block)
            continue
        if version == CURRENT_BLOCK_VERSIONS.get(block_type):
            report[block.get("id")] = "current"
            blocks.append(new_block)
            continue
        to_version, data, migrated = migrate_block(
            block_type, version, block.get("data")
        )
        if migrated:
            new_block["schemaVersion"] = to_version
            new_block["data"] = data
            report[block.get("id")] = "migrated"
            blocks.append(new_block)
            continue
        report[block.get("id")] = "unsupported"
        blocks.append(new_block)
    return {**document, "blocks": blocks}, report


if __name__ == "__main__":
    import json
    import sys
    from pathlib import Path
    from publisle import parse_json

    document, report = migrate_document(parse_json(Path(sys.argv[1]).read_bytes()))
    print(json.dumps({"document": document, "report": report}, ensure_ascii=False))
