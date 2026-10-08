# JSON wire and digest profile

Canonical interchange is UTF-8 JSON. Plain-text files contain exactly one JSON value. Byte-order marks, trailing content, duplicate decoded member names, malformed JSON, invalid UTF-8, lone UTF-16 surrogates and non-finite parsed numbers are rejected. Escaped and literal spellings of the same member name are duplicates. Errors have stable codes and a zero-based UTF-16 offset in decoded input; escaped-string Unicode errors identify the string token start, and invalid UTF-8 reports offset 0.

Default text boundaries: 2 MiB UTF-8, depth 128 (root at depth 0), 100,000 values. Hosts MAY choose positive safe-integer parser limits; oversize inputs fail with json-limit-exceeded. Limits are rejection policy, not a document version. Duplicate detection happens before object construction; **proto** is an ordinary own data property.

## Value semantics

Absent fields differ from explicit null. No validation default implies insertion or deletion. Arrays preserve order, including repeated entries; set semantics require a separately declared field rule. Strings and member names preserve Unicode exactly: no NFC/NFD normalization, locale conversion or whitespace cleanup for digest agreement.

Ordinary numbers use finite IEEE 754 binary64 and ECMAScript decimal-to-binary rounding, including underflow. Numeric lexemes are not preserved by structural parsing. Negative zero canonicalizes to 0. Exact integers outside the safe integer domain, exact decimal quantities and higher-precision values MUST use schema-declared strings. The reviewed integer/decimal string patterns prohibit exponent notation and leading zeros; units, scale, precision and numerical tolerances belong to their contracts, not automatic coercion. Authors requiring exactness cannot recover it after a binary64 parse.

Existing IDs are UUIDs or ULIDs, case-preserved; ID generation is not canonicalization. Block type IDs are nonempty namespaced strings separated by a colon without ECMAScript whitespace. Block IDs must be unique within a document; cross-document placement identity is a later artifact concern. Labels use ASCII letter followed by ASCII letters, digits, underscore, colon, dot or hyphen. No identifier case normalization is implicit.

URI fields may be relative; preparation needs an explicit source/host base for resolution. URI normalization and retrieval are not JSON validation. Publication times use YYYY-MM-DDTHH:mm:ss with optional fractional seconds and required Z or signed HH:mm timezone. Full calendar/range checks are semantic checks; format is annotation-only in the structural schema. Precision is preserved as authored text, not truncated or converted to local time.

## Canonicalization and digests

Use [RFC 8785](https://www.rfc-editor.org/info/rfc8785/) JCS: recursive UTF-16 code-unit property ordering, ordered arrays, no insignificant whitespace, ECMAScript primitive serialization and unchanged valid Unicode. Property order is NOT locale order or Unicode code-point order.

The generic digest preimage is exactly UTF-8(canonicalizeJson(value)). Hash with SHA-256 and encode as sha256: followed by 64 lowercase hexadecimal characters. No implicit property exclusions, Unicode normalization, salt or trailing newline. Binary assets are hashed over their actual bytes, not their descriptors.

Keep a digest outside its own generic preimage. Future contract/lock formats must specify their exact digest-bearing wrapper and explicit projection exclusions before adopting them; this API does not guess or strip fields named digest/id. Existing internal sorted cache serializers are NOT advertised as this canonical digest profile; their migration belongs to resource/identity work.

Programmatic canonicalization accepts plain data objects (including null-prototype objects), dense arrays and JSON primitives. Reject cycles, undefined, bigint, functions, symbols, non-finite numbers, non-data/accessor properties, exotic prototypes, sparse arrays and extra array properties. Never invoke toJSON or getters. Shared acyclic object values are allowed. Default byte/depth/node limits also apply. This is a data boundary, not protection against arbitrary malicious JavaScript proxies.

Shared [canonical fixtures](../../packages/contracts/fixtures/canonical.json) cover bytes and expected digests; negative [boundary fixtures](../../packages/contracts/fixtures/invalid-json.json) retain original text so evidence is not discarded. Python agreement is a later required conformance gate, not a G1 claim.
