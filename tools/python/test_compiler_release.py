"""Release records must match the actual published multi-platform OCI index."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "compiler-release-record.py"


class CompilerReleaseTests(unittest.TestCase):
    def record(self, platforms):
        with tempfile.TemporaryDirectory() as directory:
            stage = Path(directory)
            recipe = stage / "packages/research/compiler/release.json"
            recipe.parent.mkdir(parents=True)
            recipe.write_text(json.dumps({"recipeVersion": 2}))
            (stage / "manifest.json").write_text(json.dumps({"manifests": platforms}))
            return subprocess.run(
                [sys.executable, str(SCRIPT), "ghcr.io/voidreg/publisle-compiler",
                 "sha256:" + "c" * 64, "sha256:" + "a" * 64, "sha256:" + "b" * 64],
                cwd=stage, text=True, capture_output=True, check=False,
            )

    def platforms(self):
        return [
            {"platform": {"os": "linux", "architecture": "amd64"}, "digest": "sha256:" + "a" * 64},
            {"platform": {"os": "linux", "architecture": "arm64"}, "digest": "sha256:" + "b" * 64},
        ]

    def test_preserves_index_and_both_platform_digests(self):
        result = self.record(self.platforms())
        self.assertEqual(result.returncode, 0, result.stderr)
        record = json.loads(result.stdout)
        self.assertEqual(record["publishedImage"], "ghcr.io/voidreg/publisle-compiler@sha256:" + "c" * 64)
        self.assertEqual(record["platforms"]["linux/arm64"], "sha256:" + "b" * 64)
        self.assertEqual(record["veraPdf"]["version"], "1.28.2")

    def test_refuses_missing_or_mismatched_platforms(self):
        for platforms in [self.platforms()[:1], self.platforms()[::-1][:1]]:
            with self.subTest(platforms=platforms):
                result = self.record(platforms)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Unexpected compiler platforms", result.stderr)
        platforms = self.platforms()
        platforms[1]["digest"] = "sha256:" + "d" * 64
        self.assertNotEqual(self.record(platforms).returncode, 0)


class CompilerPlatformDigestTests(unittest.TestCase):
    def extract(self, manifest):
        return subprocess.run(
            [sys.executable, str(SCRIPT.with_name("compiler-platform-digest.py")), "arm64"],
            input=json.dumps(manifest), text=True, capture_output=True, check=False,
        )

    def test_extracts_leaf_digest_from_single_image_or_index(self):
        digest = "sha256:" + "b" * 64
        for manifest in [{"digest": digest}, {"manifests": [
                {"digest": digest, "platform": {"os": "linux", "architecture": "arm64"}},
                {"digest": "sha256:" + "d" * 64, "platform": {"os": "unknown", "architecture": "unknown"}},
        ]}]:
            with self.subTest(manifest=manifest):
                result = self.extract(manifest)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.strip(), digest)

    def test_refuses_index_without_requested_platform(self):
        self.assertNotEqual(self.extract({"manifests": []}).returncode, 0)
