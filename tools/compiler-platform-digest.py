"""Extract the platform manifest digest from buildx inspection, including OCI indices."""
import json
import re
import sys

arch = sys.argv[1]
manifest = json.load(sys.stdin)
if arch not in ("amd64", "arm64"):
    raise SystemExit("Unsupported compiler architecture")
if "manifests" in manifest:
    matches = [item for item in manifest["manifests"]
               if item.get("platform", {}).get("os") == "linux"
               and item.get("platform", {}).get("architecture") == arch]
    if len(matches) != 1:
        raise SystemExit("Expected exactly one compiler platform manifest")
    digest = matches[0]["digest"]
else:
    digest = manifest["digest"]
if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
    raise SystemExit("Invalid platform manifest digest")
print(digest)
