import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import * as z from "zod";
import {
  SCAN_FILE_VERSION, SUPPORTED_SCAN_FILE_VERSIONS, scanFileSchema,
  parseScanFile, createScanFile,
} from "../dist/index.js";

const fixtures = new URL("../fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", fixtures), "utf8"));
const minimal = JSON.parse(readFileSync(new URL("valid/minimal-v1.json", fixtures), "utf8"));
const input = { ...minimal };
delete input.version;

for (const entry of manifest) {
  test(`fixture ${entry.file}: ${entry.reason}`, () => {
    const result = parseScanFile(JSON.parse(readFileSync(new URL(entry.file, fixtures), "utf8")));
    assert.equal(result.ok ? "ok" : result.kind, entry.expected);
    if (result.ok) {
      assert.equal(result.file.version, 1);
      assert.equal(typeof result.file.synced, "boolean");
      for (const [field, expected] of Object.entries(entry.normalized ?? {})) {
        assert.equal(result.file[field], expected, field);
      }
      for (const field of entry.absent ?? []) assert.equal(result.file[field], undefined, field);
    } else {
      assert.match(result.message, /Papersync/);
      assert.doesNotMatch(result.message, /—/);
    }
  });
}

test("manifest covers every shipped fixture exactly once", () => {
  const actual = ["valid", "invalid"].flatMap((dir) =>
    readdirSync(new URL(`${dir}/`, fixtures)).map((file) => `${dir}/${file}`));
  assert.deepEqual(manifest.map((entry) => entry.file).sort(), actual.sort());
  assert.equal(new Set(actual).size, manifest.length);
});

test("read normalization strips unknown keys without mutating the input", () => {
  const raw = { ...minimal, version: "1", title: "  Title  ", summary: "  Summary  ", unknown: true };
  const result = parseScanFile(raw);
  assert.equal(result.ok, true);
  assert.deepEqual(result.file, { ...minimal, version: 1, title: "Title", summary: "Summary", synced: false });
  assert.equal(raw.title, "  Title  ");
  assert.equal(raw.unknown, true);
  assert.equal(SCAN_FILE_VERSION, 1);
  assert.deepEqual(SUPPORTED_SCAN_FILE_VERSIONS, [1]);
  assert.equal(scanFileSchema.parse(minimal).synced, false);
  assert.equal(parseScanFile({ ...minimal, title: " ", summary: "\n" }).file.title, undefined);
  assert.equal(parseScanFile({ ...minimal, title: " ", summary: "\n" }).file.summary, undefined);
  assert.equal(parseScanFile({ ...minimal, title: "t".repeat(1000), summary: "s".repeat(1000) }).file.title.length, 1000);
  assert.equal(parseScanFile({ ...minimal, provider: " future " }).file.provider, " future ");
});

test("bad optional metadata becomes absent while the scan and its valid sibling survive", () => {
  for (const value of [undefined, null, 3, NaN, true, false, {}, [], ["text"]]) {
    for (const field of ["title", "summary"]) {
      const sibling = field === "title" ? "summary" : "title";
      const result = parseScanFile({ ...minimal, [field]: value, [sibling]: "  Keep me  " });
      assert.equal(result.ok, true);
      assert.equal(result.file[field], undefined);
      assert.equal(result.file[sibling], "Keep me");
    }
  }
});

test("version classification is explicit, including malformed envelopes", () => {
  for (const version of [0, -1, 2, 1.5, "2", "", "1.0", "01", "future"]) {
    assert.equal(parseScanFile({ version }).kind, "unsupported_version");
    assert.equal(scanFileSchema.safeParse({ ...minimal, version }).success, false);
  }
  for (const raw of [null, undefined, [], "text", 1, {}, { version: null }, { version: false }, { version: {} }, { version: [] }, { version: NaN }, { version: Infinity }]) {
    assert.equal(parseScanFile(raw).kind, "schema");
  }
  // A future format may have completely different required fields.
  assert.equal(parseScanFile({ version: 2, markdown: false }).kind, "unsupported_version");
});

test("errors list every issue path and English message without changing zod globals", () => {
  const before = z.config();
  const result = parseScanFile({ ...minimal, createdAt: "bad", confidence: "101", provider: "", markdown: 3 });
  assert.equal(result.kind, "schema");
  for (const path of ["createdAt", "confidence", "provider", "markdown"]) assert.ok(result.message.includes(`${path}: `));
  assert.match(result.message, /Must be a valid ISO datetime in UTC/);
  assert.match(parseScanFile(null).message, /\(root\): Must be an object/);
  assert.match(parseScanFile({ ...minimal, version: false }).message, /version: Must be 1 or "1"/);
  assert.deepEqual(z.config(), before);
});

test("all required field types are enforced, while empty strings remain readable", () => {
  for (const field of Object.keys(minimal)) {
    const raw = { ...minimal };
    delete raw[field];
    assert.equal(parseScanFile(raw).kind, "schema", field);
  }
  for (const field of ["createdAt", "markdown", "provider", "model", "imageFileName", "synced", "confidence"]) {
    assert.equal(parseScanFile({ ...minimal, [field]: null }).kind, "schema", field);
  }
  for (const confidence of [NaN, Infinity, -Infinity, "72", "", null, true, {}, []]) assert.equal(parseScanFile({ ...minimal, confidence }).kind, "schema");
  assert.equal(parseScanFile({ ...minimal, markdown: "", model: "", imageFileName: "" }).ok, true);
});

test("builder validates, uses numeric v1, leaves markdown untouched, and omits synced", () => {
  const file = createScanFile({ ...input, createdAt: new Date(input.createdAt), title: "  Title  ", summary: " Summary " });
  assert.deepEqual(file, { ...minimal, title: "Title", summary: "Summary" });
  assert.equal(Object.hasOwn(file, "synced"), false);
  assert.equal(Object.hasOwn(createScanFile(input), "title"), false);
  assert.equal(Object.hasOwn(createScanFile(input), "summary"), false);
  assert.equal(parseScanFile(JSON.parse(JSON.stringify(file))).ok, true);
  assert.equal(createScanFile({ ...input, synced: true, extra: true }).synced, undefined);
  assert.equal(createScanFile({ ...input, extra: true }).extra, undefined);
  assert.equal(createScanFile({ ...input, markdown: "  **raw**\n" }).markdown, "  **raw**\n");
  assert.equal(Object.hasOwn(createScanFile({ ...input, title: " ", summary: "\n" }), "title"), false);
});

test("reads and writes scale fractions, round, and clamp confidence identically", () => {
  for (const [confidence, expected] of [
    [-Number.MAX_VALUE, 0], [-5, 0], [-1, 0], [-0, 0], [0, 0],
    [Number.MIN_VALUE, 0], [0.004, 0], [0.005, 1], [0.4, 40],
    [0.725, 73], [0.9, 90], [0.995, 100], [1, 1], [1.01, 1],
    [72.5, 73], [99.7, 100], [100, 100], [101, 100], [Number.MAX_VALUE, 100],
  ]) {
    const raw = { ...minimal, confidence };
    const result = parseScanFile(raw);
    assert.equal(result.ok, true);
    assert.equal(result.file.confidence, expected, `read ${confidence}`);
    assert.equal(raw.confidence, confidence);
    assert.equal(createScanFile({ ...input, confidence }).confidence, expected, `write ${confidence}`);
    assert.equal(scanFileSchema.parse(result.file).confidence, expected, "normalization is idempotent");
  }
});

test("builder rejects non-finite or non-number confidence and malformed required fields", () => {
  for (const confidence of [NaN, Infinity, -Infinity, "72", "", null, true, {}, []]) assert.throws(() => createScanFile({ ...input, confidence }), z.ZodError);
  for (const changes of [{ createdAt: "bad" }, { confidence: undefined }, { provider: " " }, { markdown: null }, { title: 3 }, { summary: false }]) {
    assert.throws(() => createScanFile({ ...input, ...changes }), z.ZodError);
  }
  assert.throws(() => createScanFile({ ...input, createdAt: new Date(NaN) }), RangeError);
});

test("writer metadata caps include ellipsis, cut at a word boundary, and preserve Unicode", () => {
  for (const [field, limit] of [["title", 80], ["summary", 200]]) {
    assert.equal(createScanFile({ ...input, [field]: "a".repeat(limit) })[field], "a".repeat(limit));
    assert.equal(createScanFile({ ...input, [field]: "a".repeat(limit + 1) })[field], "a".repeat(limit - 1) + "…");
    assert.equal(createScanFile({ ...input, [field]: "a".repeat(limit - 1) + " extra" })[field], "a".repeat(limit - 1) + "…");
    assert.equal(createScanFile({ ...input, [field]: "word ".repeat(limit) })[field], "word ".repeat(limit / 5).trimEnd() + "…");
    const unicode = createScanFile({ ...input, [field]: "😀".repeat(limit + 1) })[field];
    assert.equal(Array.from(unicode).length, limit);
    assert.equal(unicode, "😀".repeat(limit - 1) + "…");
    assert.equal(createScanFile({ ...input, [field]: "word\n".repeat(limit) })[field].endsWith("…"), true);
  }
});
