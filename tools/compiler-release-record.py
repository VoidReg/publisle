"""Check the published OCI index and emit the reviewed release metadata artifact."""
import json
from pathlib import Path
import re
import runpy
import sys

registry, index, amd64, arm64 = sys.argv[1:]
for digest in (index, amd64, arm64):
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
        raise SystemExit("Invalid compiler digest")
manifest = json.loads(Path("manifest.json").read_text())
platforms = {
    f"{item['platform']['os']}/{item['platform']['architecture']}": item["digest"]
    for item in manifest["manifests"]
}
if len(manifest["manifests"]) != 2 or platforms != {"linux/amd64": amd64, "linux/arm64": arm64}:
    raise SystemExit(f"Unexpected compiler platforms or digests: {platforms}")
recipe = json.loads(Path("packages/research/compiler/release.json").read_text())
validator = runpy.run_path(str(Path(__file__).with_name("install-verapdf.py")))
print(json.dumps({
    "recipeVersion": recipe["recipeVersion"],
    "publishedImage": f"{registry}@{index}",
    "platforms": platforms,
    "veraPdf": {
        "version": validator["VERSION"],
        "installerSha256": validator["SHA256"],
    },
    "verification": "Native amd64 and arm64 publisher compilation and veraPDF PDF/UA-2 and PDF/UA-1 gates passed before platform publication.",
}, indent=2))
