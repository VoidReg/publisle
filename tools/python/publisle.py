"""Independent, offline Publisle beta structural consumer (Python 3.11+).

No plugin imports, network requests, Node subprocesses, defaults or migrations.
The vendored pure-Python JCS wheel is checksum-verified before zipimport.
"""

import hashlib
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import unquote

WHEEL = Path(__file__).parent / "vendor/rfc8785-0.1.4-py3-none-any.whl"
WHEEL_SHA256 = "520d690b448ecf0703691c76e1a34a24ddcd4fc5bc41d589cb7c58ec651bcd48"
if hashlib.sha256(WHEEL.read_bytes()).hexdigest() != WHEEL_SHA256:
    raise RuntimeError("Vendored JCS dependency integrity mismatch")
sys.path.insert(0, str(WHEEL))
import rfc8785  # noqa: E402


class ConsumerError(ValueError):
    def __init__(self, code, message, pointer=""):
        super().__init__(message)
        self.code, self.pointer = code, pointer


def fail(code, message, pointer=""):
    raise ConsumerError(code, message, pointer)


def unicode_check(value):
    try:
        value.encode("utf-8", errors="strict")
    except UnicodeError:
        fail("invalid-json-unicode", "Invalid Unicode sequence")


def json_value(value, depth=0, counter=None, ancestors=None):
    """Read-only validation; convert ordinary Python numbers to wire binary64."""
    counter = [0] if counter is None else counter
    ancestors = set() if ancestors is None else ancestors
    counter[0] += 1
    if counter[0] > 100_000 or depth > 128:
        fail("json-limit-exceeded", "JSON value complexity exceeds limits")
    if value is None or type(value) is bool:
        return value
    if type(value) in (int, float):
        try:
            number = float(value)
        except OverflowError:
            fail("invalid-json-number", "Number exceeds binary64 domain")
        if not math.isfinite(number):
            fail("invalid-json-number", "Non-finite binary64 number")
        return number
    if type(value) is str:
        unicode_check(value)
        return value
    if type(value) not in (dict, list):
        fail("invalid-json", "Only JSON values are supported")
    if id(value) in ancestors:
        fail("invalid-json", "Cyclic JSON value")
    ancestors.add(id(value))
    try:
        if type(value) is list:
            return [json_value(v, depth + 1, counter, ancestors) for v in value]
        result = {}
        for key, child in value.items():
            if type(key) is not str:
                fail("invalid-json", "Object keys must be strings")
            unicode_check(key)
            result[key] = json_value(child, depth + 1, counter, ancestors)
        return result
    finally:
        ancestors.remove(id(value))


def parse_json(source, max_bytes=2 * 1024 * 1024):
    if type(source) is bytes:
        if len(source) > max_bytes:
            fail("json-limit-exceeded", "JSON exceeds byte limit")
        try:
            source = source.decode("utf-8", errors="strict")
        except UnicodeError:
            fail("invalid-json-unicode", "Invalid UTF-8")
    if type(source) is not str:
        fail("invalid-json", "Expected UTF-8 JSON text")
    unicode_check(source)
    if len(source.encode("utf-8")) > max_bytes:
        fail("json-limit-exceeded", "JSON exceeds byte limit")
    # Bound nesting before the platform decoder can exhaust its stack.
    quoted = escaped = False
    depth = 0
    for char in source:
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char in "[{":
            depth += 1
            if depth > 129:
                fail("json-limit-exceeded", "JSON nesting exceeds limit")
        elif char in "]}":
            depth -= 1

    def pairs(entries):
        result = {}
        for key, value in entries:
            if key in result:
                fail("duplicate-json-member", "Duplicate object member")
            result[key] = value
        return result

    def constant(_):
        fail("invalid-json", "Non-JSON numeric token")

    try:
        value = json.loads(source, object_pairs_hook=pairs, parse_int=float,
                           parse_float=float, parse_constant=constant)
    except (json.JSONDecodeError, RecursionError):
        fail("invalid-json", "Malformed JSON")
    return json_value(value)


def canonicalize(value):
    result = rfc8785.dumps(json_value(value))
    if len(result) > 2 * 1024 * 1024:
        fail("json-limit-exceeded", "Canonical JSON exceeds byte limit")
    return result


def digest(value):
    return "sha256:" + hashlib.sha256(canonicalize(value)).hexdigest()


KEYWORDS = set("""$schema $id $ref $defs $vocabulary title description default
examples $comment deprecated readOnly writeOnly type enum const required properties
additionalProperties items prefixItems minItems maxItems uniqueItems minLength
maxLength pattern format minimum maximum exclusiveMinimum exclusiveMaximum
multipleOf minProperties maxProperties allOf anyOf oneOf not if then else""".split())
VOCABULARIES = {"https://json-schema.org/draft/2020-12/vocab/" + name for name in
                ("core", "applicator", "validation", "meta-data", "format-annotation")}
TYPES = {"null", "boolean", "object", "array", "number", "integer", "string"}
WHITE = r"\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF"
END = r"$(?![\s\S])"
PATTERNS = {
    r"^sha256:[0-9a-f]{64}" + END,
    r"^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26})" + END,
    "^[^" + WHITE + ":]+:[^" + WHITE + "]+" + END,
    r"^[A-Za-z][A-Za-z0-9_:.-]*" + END,
    r"^-?(?:0|[1-9][0-9]*)" + END,
    r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?" + END,
    "[^" + WHITE + "]",
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})" + END,
}


def escape(value):
    return value.replace("~", "~0").replace("/", "~1")


def utf16_order(value):
    return value.encode("utf-16-be")


def numeric(value):
    return type(value) in (float, int) and math.isfinite(value)


class SchemaValidator:
    """Finite reviewed Draft 2020-12 subset, offline references only."""

    def __init__(self, schema, dependencies=()):
        if len(dependencies) > 128:
            fail("unsupported-contract", "Schema dependency count exceeds 128")
        sources = [json_value(entry) for entry in [schema, *dependencies]]
        if sum(len(canonicalize(entry)) for entry in sources) > 8 * 1024 * 1024:
            fail("invalid-json", "Schema set exceeds 8 MiB")
        self.locations, self.edges, self.refs = {}, {}, {}
        roots = set()
        for index, source in enumerate(sources):
            base = source.get("$id") if type(source) is dict else None
            if base is not None and (type(base) is not str or not re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", base)):
                fail("unsupported-contract", "Schema IDs must be absolute")
            base = base or f"urn:publisle:anonymous-schema:{index}"
            if base in roots or "#" in base:
                fail("unsupported-contract", "Duplicate ID or ID fragment")
            roots.add(base)
            self.inspect(source, base, "", 0)
            if index == 0:
                self.root = base + "#"
        for key, (node, base, pointer) in self.locations.items():
            if type(node) is dict and "$ref" in node:
                ref = node["$ref"]
                if type(ref) is not str:
                    fail("invalid-contract", "$ref must be a string", pointer)
                resource, sep, fragment = ref.partition("#")
                try:
                    if re.search(r"%(?![0-9A-Fa-f]{2})", fragment):
                        raise ValueError("Invalid percent escape")
                    fragment = unquote(fragment, errors="strict")
                except (UnicodeError, ValueError):
                    fail("unsupported-contract", "Malformed reference fragment", pointer)
                target = (resource or base) + "#" + (fragment if sep else "")
                if target not in self.locations:
                    fail("unsupported-contract", "Reference not in supplied schema set", pointer)
                self.refs[key] = target
                self.edges[key].append(target)
        visited, active = set(), set()

        def visit(key, depth):
            if key in active or depth > 128:
                fail("unsupported-contract", "Non-productive recursion or excessive depth")
            if key in visited:
                return
            active.add(key)
            for edge in self.edges[key]:
                visit(edge, depth + 1)
            active.remove(key)
            visited.add(key)

        for key in self.locations:
            visit(key, 0)

    def inspect(self, node, base, pointer, depth):
        if len(self.locations) >= 4096 or depth > 64:
            fail("unsupported-contract", "Schema complexity exceeds limits", pointer)
        if type(node) not in (bool, dict):
            fail("invalid-contract", "Schema must be object or boolean", pointer)
        key = base + "#" + pointer
        self.locations[key] = (node, base, pointer)
        self.edges[key] = []
        if type(node) is bool:
            return
        if set(node) - KEYWORDS:
            fail("unsupported-contract", "Unsupported schema keyword", pointer)
        if pointer and any(k in node for k in ("$id", "$schema", "$vocabulary")):
            fail("unsupported-contract", "Root-only dialect, vocabulary and ID", pointer)
        if "$schema" in node and node["$schema"] != "https://json-schema.org/draft/2020-12/schema":
            fail("unsupported-contract", "Unsupported dialect", pointer)
        if "pattern" in node and (type(node["pattern"]) is not str or node["pattern"] not in PATTERNS):
            fail("unsupported-contract", "Pattern outside reviewed set", pointer)
        if "$vocabulary" in node:
            vocabs = node["$vocabulary"]
            if type(vocabs) is not dict or any(type(v) is not bool for v in vocabs.values()):
                fail("invalid-contract", "Invalid vocabulary declaration", pointer)
            if any(required and name not in VOCABULARIES for name, required in vocabs.items()):
                fail("unsupported-contract", "Unsupported required vocabulary", pointer)
        for name in ("$id", "$ref", "$schema", "title", "description", "$comment", "format"):
            if name in node and type(node[name]) is not str:
                fail("invalid-contract", f"{name} must be string", pointer)
        for name in ("deprecated", "readOnly", "writeOnly", "uniqueItems"):
            if name in node and type(node[name]) is not bool:
                fail("invalid-contract", f"{name} must be boolean", pointer)
        for name in ("minItems", "maxItems", "minLength", "maxLength", "minProperties", "maxProperties"):
            if name in node and (not numeric(node[name]) or node[name] < 0 or node[name] % 1):
                fail("invalid-contract", f"{name} must be nonnegative integer", pointer)
        for name in ("minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"):
            if name in node and (not numeric(node[name]) or (name == "multipleOf" and node[name] <= 0)):
                fail("invalid-contract", f"Invalid {name}", pointer)
        if "type" in node:
            types = node["type"] if type(node["type"]) is list else [node["type"]]
            if not types or any(type(t) is not str or t not in TYPES for t in types) or len(set(types)) != len(types):
                fail("invalid-contract", "Invalid type declaration", pointer)
        for name in ("required", "enum", "examples"):
            if name not in node:
                continue
            entries = node[name]
            if type(entries) is not list or (name == "enum" and not entries):
                fail("invalid-contract", f"Invalid {name}", pointer)
            if name == "required" and (any(type(v) is not str for v in entries) or len(set(entries)) != len(entries)):
                fail("invalid-contract", "Invalid required", pointer)
        for name in ("$defs", "properties"):
            if name in node:
                if type(node[name]) is not dict:
                    fail("invalid-contract", f"Invalid {name}", pointer)
                for child_name, child in node[name].items():
                    self.inspect(child, base, pointer + "/" + name + "/" + escape(child_name), depth + 1)
        for name in ("items", "additionalProperties", "not", "if", "then", "else"):
            if name in node:
                child_pointer = pointer + "/" + name
                self.inspect(node[name], base, child_pointer, depth + 1)
                if name in ("not", "if", "then", "else"):
                    self.edges[key].append(base + "#" + child_pointer)
        for name in ("allOf", "anyOf", "oneOf", "prefixItems"):
            if name in node:
                entries = node[name]
                if type(entries) is not list or not entries:
                    fail("invalid-contract", f"Invalid {name}", pointer)
                if len(entries) > 16:
                    fail("unsupported-contract", "Branch count exceeds 16", pointer)
                for index, child in enumerate(entries):
                    child_pointer = pointer + "/" + name + "/" + str(index)
                    self.inspect(child, base, child_pointer, depth + 1)
                    if name != "prefixItems":
                        self.edges[key].append(base + "#" + child_pointer)

    def matches(self, value):
        self.steps = 0
        return self.evaluate(value, self.root, 0)

    def evaluate(self, value, key, depth):
        self.steps += 1
        if self.steps > 100_000 or depth > 256:
            fail("unsupported-contract", "Validation evaluation budget exceeded")
        node, base, pointer = self.locations[key]
        if type(node) is bool:
            return node
        child = lambda name: base + "#" + pointer + "/" + name
        test = lambda val, loc: self.evaluate(val, loc, depth + 1)
        if key in self.refs and not test(value, self.refs[key]):
            return False
        if "type" in node:
            types = node["type"] if type(node["type"]) is list else [node["type"]]
            actual = ("null" if value is None else "boolean" if type(value) is bool else
                      "string" if type(value) is str else "object" if type(value) is dict else
                      "array" if type(value) is list else "number")
            if actual not in types and not (actual == "number" and "integer" in types and value % 1 == 0):
                return False
        if "const" in node and canonicalize(value) != canonicalize(node["const"]):
            return False
        if "enum" in node and not any(canonicalize(value) == canonicalize(v) for v in node["enum"]):
            return False
        if numeric(value):
            for name, wrong in (("minimum", lambda n: value < n), ("maximum", lambda n: value > n),
                                ("exclusiveMinimum", lambda n: value <= n), ("exclusiveMaximum", lambda n: value >= n)):
                if name in node and wrong(node[name]):
                    return False
            if "multipleOf" in node:
                quotient = value / node["multipleOf"]
                if not math.isfinite(quotient) or quotient % 1:
                    return False
        if type(value) in (str, list, dict):
            suffix = "Length" if type(value) is str else "Items" if type(value) is list else "Properties"
            if len(value) < node.get("min" + suffix, 0) or len(value) > node.get("max" + suffix, math.inf):
                return False
        if type(value) is str and "pattern" in node and re.search(node["pattern"], value) is None:
            return False
        if type(value) is dict:
            if any(name not in value for name in node.get("required", [])):
                return False
            properties = node.get("properties", {})
            for name, val in value.items():
                if name in properties and not test(val, child("properties/" + escape(name))):
                    return False
                if name not in properties and "additionalProperties" in node and not test(val, child("additionalProperties")):
                    return False
        if type(value) is list:
            if node.get("uniqueItems") and len({canonicalize(v) for v in value}) != len(value):
                return False
            prefix = node.get("prefixItems", [])
            for index, val in enumerate(value):
                if index < len(prefix) and not test(val, child("prefixItems/" + str(index))):
                    return False
                if index >= len(prefix) and "items" in node and not test(val, child("items")):
                    return False
        for name in ("allOf", "anyOf", "oneOf"):
            if name in node:
                results = [test(value, child(name + "/" + str(i))) for i in range(len(node[name]))]
                if (name == "allOf" and not all(results)) or (name == "anyOf" and not any(results)) or (name == "oneOf" and sum(results) != 1):
                    return False
        if "not" in node and test(value, child("not")):
            return False
        if "if" in node:
            branch = "then" if test(value, child("if")) else "else"
            if branch in node and not test(value, child(branch)):
                return False
        return True


def validate_structure(value, schema, dependencies=()):
    try:
        validator = SchemaValidator(schema, dependencies)
        value = parse_json(canonicalize(value))
        if not validator.matches(value):
            fail("invalid-data", "Instance does not satisfy supplied schema")
        return {"valid": True, "diagnostics": []}
    except ConsumerError as error:
        code = "invalid-json" if error.code.startswith("invalid-json") or error.code == "json-limit-exceeded" else error.code
        return {"valid": False, "diagnostics": [{"code": code, "pointer": error.pointer, "message": str(error)}]}


def object_shape(value, required, optional=()):
    if type(value) is not dict or not set(required) <= set(value) or set(value) - set(required) - set(optional):
        fail("invalid-contract", "Invalid contract object shape")


def texts(value, maximum=4096):
    if type(value) is not list or len(value) > maximum or any(type(v) is not str or not v for v in value):
        fail("invalid-contract", "Expected bounded nonempty strings")


def dictionary(value):
    if type(value) is not dict or any(type(v) is not str or not v for v in value.values()):
        fail("invalid-contract", "Expected string dictionary")


def schema_closure(root, dependencies):
    """Verify exact, sorted, supplied dependency closure; never retrieve references."""
    SchemaValidator(root, dependencies)
    resources = {}
    for schema in dependencies:
        if type(schema) is not dict or type(schema.get("$id")) is not str:
            fail("invalid-contract", "Dependency schema requires absolute ID")
        if schema["$id"] in resources:
            fail("invalid-contract", "Duplicate schema dependency")
        resources[schema["$id"]] = schema
    root_id = root.get("$id") if type(root) is dict else None
    used = set()

    def walk(node):
        if type(node) is not dict:
            return
        ref = node.get("$ref", "")
        resource = ref.partition("#")[0]
        if resource and resource != root_id and resource not in used:
            if resource not in resources:
                fail("unsupported-contract", "Missing supplied schema resource")
            used.add(resource)
            walk(resources[resource])
        for name in ("$defs", "properties"):
            for child in node.get(name, {}).values():
                walk(child)
        for name in ("items", "additionalProperties", "not", "if", "then", "else"):
            walk(node.get(name))
        for name in ("allOf", "anyOf", "oneOf", "prefixItems"):
            for child in node.get(name, []):
                walk(child)

    walk(root)
    expected = [resources[key] for key in sorted(used, key=utf16_order)]
    if canonicalize(expected) != canonicalize(dependencies):
        fail("invalid-contract", "Non-minimal or unsorted schema closure")


def verify_contract(entry):
    """Verify structural contract integrity; report executable/semantic limits."""
    object_shape(entry, ("id", "digest", "contract"))
    body = entry["contract"]
    object_shape(body, ("profile", "identity", "source", "envelopeSchema", "schemas", "traversal", "semantics", "defaults", "portability", "dependencies"))
    if body["profile"] != "urn:publisle:contract:beta":
        fail("unsupported-contract", "Unsupported contract profile")
    seal = digest(body)
    if entry["digest"] != seal or entry["id"] != "urn:publisle:contract:" + seal:
        fail("contract-integrity-mismatch", "Contract digest or immutable ID mismatch")
    identity = body["identity"]
    object_shape(identity, ("type", "schemaVersion", "contractFormatVersion", "semanticProfile"))
    if (type(identity["type"]) is not str or re.search("^[^" + WHITE + ":]+:[^" + WHITE + "]+" + END, identity["type"]) is None
            or not numeric(identity["schemaVersion"]) or identity["schemaVersion"] < 1 or identity["schemaVersion"] % 1
            or identity["contractFormatVersion"] != 1 or type(identity["contractFormatVersion"]) is bool):
        fail("invalid-contract", "Invalid contract identity")
    source = body["source"]
    object_shape(source, ("mode", "dataSchema", "documentation", "behavior", "projections", "compatibility", "provenance"), ("schemaDependencies", "dependencies"))
    if source["mode"] not in ("schema-first", "verified-adapter"):
        fail("unsupported-contract", "Unsupported parser mode")
    compatibility = source["compatibility"]
    object_shape(compatibility, ("schemaProfile", "semanticProfile", "runtimeABI"))
    if compatibility["schemaProfile"] != "urn:publisle:schema-profile:beta":
        fail("unsupported-contract", "Unsupported schema profile")
    if identity["semanticProfile"] != compatibility["semanticProfile"]:
        fail("invalid-contract", "Semantic profile identity mismatch")
    for name in ("semanticProfile", "runtimeABI"):
        if type(compatibility[name]) is not str or not compatibility[name]:
            fail("invalid-contract", "Invalid compatibility declaration")
    for name, fields in (("provenance", ("publisher", "license")), ("projections", ("reading", "semantic"))):
        object_shape(source[name], fields)
        dictionary(source[name])
    documentation = source["documentation"]
    object_shape(documentation, ("name", "purpose", "properties", "validExamples", "invalidExamples"))
    for name in ("name", "purpose"):
        if type(documentation[name]) is not str or not documentation[name]:
            fail("invalid-contract", "Invalid documentation")
    dictionary(documentation["properties"])
    behavior = source["behavior"]
    object_shape(behavior, ("limitations", "executable"))
    texts(behavior["limitations"])
    dictionary(behavior["executable"])
    portability = body["portability"]
    object_shape(portability, ("structural", "descriptive", "declarative", "implementationBound", "limitations", "executable"))
    if any(type(portability[name]) is not bool for name in ("structural", "descriptive", "declarative", "implementationBound")):
        fail("invalid-contract", "Capabilities must be booleans")
    texts(portability["limitations"])
    dictionary(portability["executable"])
    if (not portability["structural"] or not portability["descriptive"]
            or portability["implementationBound"] != bool(portability["executable"])
            or portability["declarative"] != (body["traversal"] is not None or body["semantics"] is not None)
            or any(portability["executable"].get(k) != v for k, v in behavior["executable"].items())
            or (source["mode"] == "verified-adapter" and "parse" not in portability["executable"])):
        fail("invalid-contract", "Contradictory or omitted executable capabilities")
    schemas = body["schemas"]
    if type(schemas) is not list or len(schemas) > 128:
        fail("invalid-contract", "Invalid schema inventory")
    expected_envelope = {"allOf": [{"$ref": "urn:publisle:schema:block-envelope"}, {"type": "object", "properties": {
        "type": {"const": identity["type"]}, "schemaVersion": {"const": identity["schemaVersion"]}, "data": {"$ref": "urn:publisle:contract-data"}}}]}
    if canonicalize(body["envelopeSchema"]) != canonicalize(expected_envelope):
        fail("invalid-contract", "Envelope does not enforce exact identity and data binding")
    data = source["dataSchema"]
    if type(data) is bool:
        wrapped = {"$id": "urn:publisle:contract-data", "allOf": [data]}
    elif type(data) is dict and "$id" in data:
        wrapped = {"$id": "urn:publisle:contract-data", "$ref": data["$id"]}
    elif type(data) is dict:
        wrapped = {**data, "$id": "urn:publisle:contract-data"}
    else:
        fail("invalid-contract", "Invalid data schema")
    resource = next((v for v in schemas if type(v) is dict and v.get("$id") == "urn:publisle:contract-data"), None)
    if canonicalize(resource) != canonicalize(wrapped):
        fail("invalid-contract", "Envelope data schema differs from declared source")
    dependencies = source.get("schemaDependencies", [])
    if type(dependencies) is not list:
        fail("invalid-contract", "Invalid schema dependencies")
    schema_closure(data, dependencies)
    schema_closure(body["envelopeSchema"], schemas)
    validator = SchemaValidator(data, dependencies)
    envelope = SchemaValidator(body["envelopeSchema"], schemas)
    for name in ("validExamples", "invalidExamples"):
        examples = documentation[name]
        if type(examples) is not list or not 1 <= len(examples) <= 64:
            fail("invalid-contract", "Invalid example count")
        for example in examples:
            object_shape(example, ("input", "output") if name == "validExamples" else ("input", "diagnostic"))
            if name == "validExamples":
                if source["mode"] == "schema-first" and canonicalize(example["input"]) != canonicalize(example["output"]):
                    fail("invalid-contract", "Schema-first examples must be read-only")
                sample = {"id": "00000000-0000-4000-8000-000000000001", "type": identity["type"], "schemaVersion": identity["schemaVersion"], "data": example["output"]}
                if not validator.matches(example["output"]) or not envelope.matches(sample):
                    fail("invalid-contract", "Positive example violates schema")
            elif type(example["diagnostic"]) is not str or not example["diagnostic"] or validator.matches(example["input"]):
                fail("invalid-contract", "Invalid negative example")
    texts(body["dependencies"])
    for name in ("semantics", "traversal"):
        if body[name] is not None and type(body[name]) is not dict:
            fail("invalid-contract", "Invalid declarative metadata")
    # Deliberately do not promote structural integrity into semantic execution.
    return {"id": entry["id"], "structural": True, "descriptive": True,
            "semanticValidation": "unsupported" if body["semantics"] is not None else "not-declared",
            "traversalExecution": "unsupported" if body["traversal"] is not None else "not-declared",
            "executable": "unsupported" if portability["executable"] else "not-declared",
            "unsupportedExecutable": portability["executable"], "limitations": portability["limitations"]}


def verify_bundle(bundle):
    object_shape(bundle, ("profile", "roots", "contracts", "lock"))
    if bundle["profile"] != "urn:publisle:contract-bundle:beta":
        fail("unsupported-contract", "Unsupported bundle profile")
    texts(bundle["roots"], 128)
    entries = bundle["contracts"]
    if type(entries) is not list or len(entries) > 128:
        fail("unsupported-contract", "Contract count exceeds limit")
    inventory, types, reports, schema_pins = {}, set(), [], {}
    for entry in entries:
        report = verify_contract(entry)
        identity = entry["contract"]["identity"]
        if entry["id"] in inventory or identity["type"] in types:
            fail("invalid-contract", "Duplicate contract identity")
        inventory[entry["id"]] = entry
        types.add(identity["type"])
        reports.append(report)
        for schema in entry["contract"]["schemas"]:
            schema_id = schema.get("$id", "anonymous") if type(schema) is dict else "anonymous"
            schema_pins[entry["id"] + "#schema:" + schema_id] = digest(schema)
    active, visited, heights = set(), set(), {}

    def visit(key, depth):
        if depth > 32 or key in active:
            fail("unsupported-contract", "Cyclic or excessive contract graph")
        if key in visited:
            if depth + heights[key] > 32:
                fail("unsupported-contract", "Contract graph exceeds depth limit")
            return
        if key not in inventory:
            fail("missing-offline-contract", "Missing immutable contract: " + key)
        active.add(key)
        body = inventory[key]["contract"]
        for dependency in body["dependencies"]:
            visit(dependency, depth + 1)
        heights[key] = max((heights[dependency] + 1 for dependency in body["dependencies"]), default=0)
        declared = body["source"].get("dependencies", [])
        actual = [{"type": inventory[key]["contract"]["identity"]["type"], "schemaVersion": inventory[key]["contract"]["identity"]["schemaVersion"]} for key in body["dependencies"]]
        if type(declared) is not list or len(declared) != len(actual) or any(canonicalize(v) not in [canonicalize(a) for a in actual] for v in declared):
            fail("invalid-contract", "Declared dependency identity mismatch")
        active.remove(key)
        visited.add(key)

    roots = sorted(set(bundle["roots"]), key=utf16_order)
    if roots != bundle["roots"]:
        fail("invalid-contract", "Roots must be unique and sorted")
    for key in roots:
        visit(key, 0)
    if len(visited) != len(inventory):
        fail("invalid-contract", "Unused offline contracts")
    lock = {"profile": "urn:publisle:contract-lock:beta", "roots": roots,
            "contracts": [{"id": e["id"], "digest": e["digest"], "type": e["contract"]["identity"]["type"], "schemaVersion": e["contract"]["identity"]["schemaVersion"], "dependencies": e["contract"]["dependencies"]} for e in sorted(entries, key=lambda e: e["id"])],
            "schemas": [{"id": key, "digest": value} for key, value in sorted(schema_pins.items(), key=lambda pair: utf16_order(pair[0]))]}
    if canonicalize(lock) != canonicalize(bundle["lock"]):
        fail("contract-lock-mismatch", "Offline inventory lock mismatch")
    return {"valid": True, "roles": ["structural-validator"], "contracts": reports}


def validate_locked_document(document, bundle, schema, dependencies=()):
    report = verify_bundle(bundle)
    structural = validate_structure(document, schema, dependencies)
    if not structural["valid"]:
        return structural
    pins = document.get("dependencies", [])
    entries = {entry["id"]: entry for entry in bundle["contracts"]}
    identities, used, block_ids = {}, set(), set()
    for pin in pins:
        object_shape(pin, ("type", "schemaVersion", "id", "digest"))
        identity = (pin["type"], pin["schemaVersion"])
        if identity in identities:
            fail("invalid-contract", "Duplicate document contract pin")
        if pin["id"] not in entries:
            fail("missing-offline-contract", "Missing document contract pin")
        entry = entries[pin["id"]]
        body_identity = entry["contract"]["identity"]
        if pin["digest"] != entry["digest"] or identity != (body_identity["type"], body_identity["schemaVersion"]):
            fail("contract-pin-mismatch", "Document type/version/digest mismatch")
        identities[identity] = entry
    for block in document["blocks"]:
        if block["id"] in block_ids:
            fail("invalid-data", "Duplicate block ID")
        block_ids.add(block["id"])
        identity = (block["type"], block["schemaVersion"])
        entry = identities.get(identity)
        if entry is None:
            fail("missing-offline-contract", "Missing exact block type/version pin")
        used.add(identity)
        body = entry["contract"]
        valid = validate_structure(block, body["envelopeSchema"], body["schemas"])
        if not valid["valid"]:
            return valid
    if used != set(identities) or set(pin["id"] for pin in pins) != set(bundle["roots"]):
        fail("contract-pin-mismatch", "Unused or mismatched document root pins")
    return {"valid": True, "sourceDigest": digest(document), "capabilities": report, "document": document}


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("digest", "validate", "bundle", "document"))
    parser.add_argument("source", type=Path)
    parser.add_argument("--schema", type=Path)
    parser.add_argument("--dependencies", type=Path, nargs="*", default=[])
    parser.add_argument("--bundle", type=Path)
    args = parser.parse_args()
    try:
        with args.source.open("rb") as stream:
            value = parse_json(stream.read(2 * 1024 * 1024 + 1))
        if args.command == "digest":
            print(digest(value))
            return 0
        if args.command == "bundle":
            print(json.dumps(verify_bundle(value)))
            return 0
        if args.schema is None:
            parser.error("validate requires --schema")
        def load(path):
            with path.open("rb") as stream:
                return parse_json(stream.read(2 * 1024 * 1024 + 1))
        schemas = [load(path) for path in args.dependencies]
        if args.command == "document":
            if args.bundle is None:
                parser.error("document requires --bundle")
            result = validate_locked_document(value, load(args.bundle), load(args.schema), schemas)
        else:
            result = validate_structure(value, load(args.schema), schemas)
        print(json.dumps(result))
        return 0 if result["valid"] else 1
    except (ConsumerError, OSError) as error:
        print(json.dumps({"valid": False, "diagnostics": [{"code": getattr(error, "code", "io-error"), "message": str(error)}]}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
