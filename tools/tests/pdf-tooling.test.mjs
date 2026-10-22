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

test(
  "deployment reads bounded regular verification files without following links",
  { skip: process.platform === "win32" },
  async () => {
    const { readFile, mkdtemp, writeFile, symlink, link, rm } =
      await import("node:fs/promises");
    const { execFileSync, spawnSync } = await import("node:child_process");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const source = await readFile(
      new URL("../../deploy/vps/activate-release.sh", import.meta.url),
      "utf8",
    );
    const block = source.match(
      /"\$VALIDATION\/verification\.json".*<<'JS'\n([\s\S]*?)\nJS/u,
    )?.[1];
    assert(block, "Privileged report reader is present");
    // Execute the production reader up to its privileged write, in a subprocess.
    const script = block.split(
      "const path='/etc/publisle-native-pdf-verified.json'",
    )[0];
    const directory = await mkdtemp(
      join(tmpdir(), "publisle-verification-test-"),
    );
    try {
      const file = join(directory, "record.json");
      await writeFile(file, JSON.stringify({ image: a, passed: true }));
      const read = (path, uid = process.getuid()) =>
        spawnSync(
          process.execPath,
          ["--input-type=module", "-", path, a, String(uid)],
          { input: script, encoding: "utf8", timeout: 5000 },
        );
      assert.equal(read(file).status, 0);
      assert.notEqual(read(file, process.getuid() + 1).status, 0);
      const symbolic = join(directory, "symbolic.json");
      await symlink(file, symbolic);
      assert.notEqual(read(symbolic).status, 0);
      const hard = join(directory, "hard.json");
      await link(file, hard);
      assert.notEqual(read(hard).status, 0);
      await rm(hard);
      const fifo = join(directory, "fifo");
      execFileSync("mkfifo", [fifo]);
      const result = read(fifo);
      assert.equal(result.error, undefined, "FIFO rejection must not block");
      assert.notEqual(result.status, 0);
      await writeFile(file, "x".repeat(1024 * 1024 + 1));
      assert.notEqual(read(file).status, 0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
