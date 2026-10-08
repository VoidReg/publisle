"""JSON-only protocol used by the cross-language test gate, never by readers."""

import json
import sys

from publisle import ConsumerError, digest, parse_json, validate_locked_document, validate_structure, verify_bundle


def deny_external_work(event, _args):
    if event in ("subprocess.Popen", "os.system", "os.exec", "os.posix_spawn", "socket.connect", "socket.getaddrinfo"):
        raise RuntimeError("Conformance consumer must remain offline and independent")


sys.addaudithook(deny_external_work)
request = parse_json(sys.stdin.buffer.read(2 * 1024 * 1024 + 1))
try:
    if request["operation"] == "structure":
        result = [validate_structure(case["value"], case["schema"], case.get("dependencies", [])) for case in request["cases"]]
    elif request["operation"] == "digest":
        result = [digest(parse_json(case)) for case in request["texts"]]
    elif request["operation"] == "bundle":
        result = verify_bundle(request["bundle"])
    elif request["operation"] == "document":
        result = validate_locked_document(request["document"], request["bundle"], request["schema"], request["dependencies"])
    else:
        raise ValueError("Unsupported conformance operation")
except ConsumerError as error:
    result = {"valid": False, "diagnostics": [{"code": error.code, "message": str(error), "pointer": error.pointer}]}
print(json.dumps(result, ensure_ascii=True))
