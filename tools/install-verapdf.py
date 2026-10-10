"""Explicit installation of the checksum-pinned veraPDF CLI (requires Java)."""
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

VERSION = "1.28.2"
URL = f"https://software.verapdf.org/releases/1.28/verapdf-greenfield-{VERSION}-installer.zip"
SHA256 = "d1693a5f0bf0997180f6d97e8a5568b0cf39e27eee338d439c8adb58435c1e89"


def install(destination):
    destination = Path(destination).resolve()
    if destination.exists():
        raise ValueError("Installation destination already exists")
    with tempfile.TemporaryDirectory(prefix="publisle-verapdf-") as directory:
        stage = Path(directory)
        archive = stage / "installer.zip"
        with urllib.request.urlopen(URL, timeout=120) as response:
            data = response.read(32 * 1024 * 1024)
        if hashlib.sha256(data).hexdigest() != SHA256:
            raise ValueError("veraPDF installer checksum mismatch")
        archive.write_bytes(data)
        with zipfile.ZipFile(archive) as source:
            jar = f"verapdf-izpack-installer-{VERSION}.jar"
            (stage / jar).write_bytes(source.read(f"verapdf-greenfield-{VERSION}/{jar}"))
        root = ET.Element("AutomatedInstallation", langpack="eng")
        prefix = "com.izforge.izpack.panels."
        ET.SubElement(root, prefix + "htmlhello.HTMLHelloPanel", id="welcome")
        target = ET.SubElement(root, prefix + "target.TargetPanel", id="install_dir")
        ET.SubElement(target, "installpath").text = str(destination)
        packs = ET.SubElement(root, prefix + "packs.PacksPanel", id="sdk_pack_select")
        for index, name in enumerate(["veraPDF GUI", "veraPDF Mac and *nix Scripts", "veraPDF Validation model", "veraPDF Documentation", "veraPDF Sample Plugins"]):
            ET.SubElement(packs, "pack", index=str(index), name=name, selected="true" if index < 2 else "false")
        ET.SubElement(root, prefix + "install.InstallPanel", id="install")
        ET.SubElement(root, prefix + "finish.FinishPanel", id="finish")
        config = stage / "install.xml"
        ET.ElementTree(root).write(config, encoding="utf-8")
        subprocess.run(["java", "-jar", str(stage / jar), str(config)], check=True, timeout=120)
    subprocess.run([str(destination / "verapdf"), "--version"], check=True, timeout=30)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 tools/install-verapdf.py NEW_DIRECTORY")
    install(sys.argv[1])
