import { test } from "node:test";
import assert from "node:assert/strict";
import { assertCompliant } from "../validate-pdf-ua.mjs";
import { platformDigest } from "../compiler-platform-digest.mjs";
import { releaseRecord } from "../compiler-release-record.mjs";
import { installerJar } from "../install-verapdf.mjs";
const valid =
  '<report><jobs><job><validationReport jobEndStatus="normal" profileName="PDF/UA-2 + Tagged PDF validation profile" isCompliant="true"><details failedRules="0" failedChecks="0"/></validationReport></job></jobs><batchSummary totalJobs="1" failedToParse="0" encrypted="0" outOfMemory="0" veraExceptions="0"><validationReports compliant="1" nonCompliant="0" failedJobs="0">1</validationReports></batchSummary></report>';
test("requires one complete, matching, successful veraPDF job", () => {
  assertCompliant(valid);
  assertCompliant(valid.replace("PDF/UA-2 + Tagged PDF", "PDF/UA-1"), "ua1");
  const invalid = [
    "not XML",
    "<report/>",
    valid.replace("PDF/UA-2", "PDF/A-2B"),
    valid.replace('isCompliant="true"', 'isCompliant="false"'),
    valid.replace('jobEndStatus="normal"', 'jobEndStatus="aborted"'),
    valid.replace('jobEndStatus="normal"', ""),
    valid.replace("</job>", "</job><job/>"),
    valid.replace('failedRules="0"', 'failedRules="1"'),
    valid.replace('failedChecks="0"', 'failedChecks="1"'),
    valid.replace('totalJobs="1"', 'totalJobs="0"'),
    valid.replace('failedToParse="0"', 'failedToParse="1"'),
    valid.replace('veraExceptions="0"', 'veraExceptions="1"'),
    valid.replace('failedJobs="0"', 'failedJobs="1"'),
    valid.replace('nonCompliant="0"', 'nonCompliant="1"'),
    valid.replace('<details failedRules="0" failedChecks="0"/>', ""),
    valid.replace(
      "</job>",
      '</job><job><validationReport isCompliant="true"/></job>',
    ),
    '<!DOCTYPE report [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + valid,
    valid + "<report/>",
    valid.replace("</report>", ""),
    valid.replace("</jobs>", "</jobs><jobs/>"),
  ];
  for (const report of invalid)
    assert.throws(() => assertCompliant(report), report);
});
const a = `sha256:${"a".repeat(64)}`;
const b = `sha256:${"b".repeat(64)}`;
const c = `sha256:${"c".repeat(64)}`;
const platforms = [
  { platform: { os: "linux", architecture: "amd64" }, digest: a },
  { platform: { os: "linux", architecture: "arm64" }, digest: b },
];
test("extracts a leaf digest without trusting extra OCI index platforms", () => {
  assert.equal(platformDigest({ digest: b }, "arm64"), b);
  assert.equal(
    platformDigest(
      {
        manifests: [
          ...platforms,
          { platform: { os: "unknown", architecture: "unknown" }, digest: c },
        ],
      },
      "arm64",
    ),
    b,
  );
  for (const manifest of [
    { manifests: [] },
    { manifests: [platforms[1], platforms[1]] },
    { digest: "sha256:no" },
  ])
    assert.throws(() => platformDigest(manifest, "arm64"));
  assert.throws(() => platformDigest({ digest: a }, "riscv64"));
});
test("release records retain and validate both actual platform digests", () => {
  const record = releaseRecord(
    "ghcr.io/voidreg/publisle-compiler",
    c,
    a,
    b,
    { manifests: platforms },
    { recipeVersion: 2 },
  );
  assert.equal(record.publishedImage, `ghcr.io/voidreg/publisle-compiler@${c}`);
  assert.equal(record.platforms["linux/arm64"], b);
  assert.equal(record.veraPdf.version, "1.28.2");
  for (const entries of [
    platforms.slice(0, 1),
    [platforms[1], platforms[1]],
    [...platforms, platforms[0]],
    [platforms[0], { ...platforms[1], digest: c }],
  ])
    assert.throws(() =>
      releaseRecord(
        "ghcr.io/voidreg/publisle-compiler",
        c,
        a,
        b,
        { manifests: entries },
        { recipeVersion: 2 },
      ),
    );
});
test("installer rejects untrusted bytes before ZIP extraction or execution", () => {
  assert.throws(
    () => installerJar(Buffer.from("not the pinned installer")),
    /checksum mismatch/,
  );
});
