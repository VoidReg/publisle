import hashlib
from pathlib import Path
import tempfile
import unittest

from publisle import ConsumerError, canonicalize, digest
from serve import load_site


class SiteServer(unittest.TestCase):
    def fixture(self, root, name="index.html", content=b"<p>Approved fallback</p>"):
        (root / "index.html").write_bytes(content)
        manifest = {"profile": "urn:publisle:host-site:beta", "entry": name, "files": [
            {"path": name, "digest": "sha256:" + hashlib.sha256(content).hexdigest(), "mediaType": "text/html; charset=utf-8"}]}
        (root / "site.json").write_bytes(canonicalize(manifest))
        return manifest

    def test_verified_site(self):
        with tempfile.TemporaryDirectory(prefix="publisle-site-") as directory:
            root = Path(directory)
            manifest = self.fixture(root)
            entry, assets = load_site(root, digest(manifest))
            self.assertEqual(entry, "index.html")
            self.assertIn(b"Approved fallback", assets[entry][0])
            (root / "index.html").write_bytes(b"changed")
            with self.assertRaises(ConsumerError) as caught:
                load_site(root, digest(manifest))
            self.assertEqual(caught.exception.code, "asset-integrity-mismatch")

    def test_missing_asset(self):
        with tempfile.TemporaryDirectory(prefix="publisle-site-") as directory:
            root = Path(directory)
            manifest = self.fixture(root, "absent.html")
            with self.assertRaises(FileNotFoundError):
                load_site(root, digest(manifest))

    def test_manifest_pin_and_paths(self):
        with tempfile.TemporaryDirectory(prefix="publisle-site-") as directory:
            root = Path(directory)
            manifest = self.fixture(root)
            with self.assertRaises(ConsumerError):
                load_site(root, "sha256:" + "0" * 64)
            for name in ("../index.html", "/index.html", "a/../index.html", "site.json", "a\\index.html"):
                manifest["files"][0]["path"] = name
                (root / "site.json").write_bytes(canonicalize(manifest))
                with self.assertRaises(ConsumerError):
                    load_site(root, digest(manifest))

    def test_symlink_parent_and_hardlink(self):
        with tempfile.TemporaryDirectory(prefix="publisle-site-") as directory:
            root = Path(directory)
            manifest = self.fixture(root)
            (root / "parent").symlink_to(root, target_is_directory=True)
            manifest["entry"] = manifest["files"][0]["path"] = "parent/index.html"
            (root / "site.json").write_bytes(canonicalize(manifest))
            with self.assertRaises(OSError):
                load_site(root, digest(manifest))
            manifest = self.fixture(root)
            (root / "link.html").hardlink_to(root / "index.html")
            with self.assertRaises(ConsumerError):
                load_site(root, digest(manifest))
