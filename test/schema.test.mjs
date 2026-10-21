import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import * as z from "zod";
import {
  SCAN_FILE_VERSION, imageFileNameFor,
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
      assert.deepEqual(JSON.parse(JSON.stringify(result.file)), entry.output);
      if (result.file.imageFileName) assert.equal(imageFileNameFor(result.file), entry.output.imageFileName);
    } else {
      assert.match(result.message, /Papersync/);
    }
  });
}

test("manifest covers every shipped fixture exactly once", () => {
  const actual = ["valid", "invalid"].flatMap((dir) =>
    readdirSync(new URL(`${dir}/`, fixtures)).map((file) => `${dir}/${file}`));
  assert.deepEqual(manifest.map((entry) => entry.file).sort(), actual.sort());
});

test("read normalization strips unknown keys without mutating the input", () => {
  const raw = { ...minimal, version: "1", title: "  Title  ", summary: "  Summary  ", unknown: true };
  const result = parseScanFile(raw);
  assert.equal(result.ok, true);
  assert.deepEqual(result.file, { ...minimal, version: 1, title: "Title", summary: "Summary", synced: false });
  assert.equal(raw.title, "  Title  ");
  assert.equal(raw.unknown, true);
  assert.equal(SCAN_FILE_VERSION, 1);
  assert.equal(parseScanFile(minimal).file.synced, false);
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

test("version classification distinguishes scan-shaped future versions from malformed input", () => {
  for (const version of [2, 999999999, "2", "999999999"]) {
    assert.equal(parseScanFile({ version, markdown: "" }).kind, "unsupported_version");
    assert.equal(parseScanFile({ version, createdAt: "" }).kind, "unsupported_version");
    assert.equal(parseScanFile({ version }).kind, "schema");
  }
  for (const version of [0, -1, 1.5, "", "1.0", "01", "future", "1 ", "v1", "2".repeat(100000), 1e9, NaN, Infinity, null, false, {}, []]) {
    const result = parseScanFile({ ...minimal, version });
    assert.equal(result.kind, "schema");
    assert.ok(result.message.length < 1000);
  }
  for (const raw of [null, undefined, [], "text", 1, {}, { version: 2, settings: {} }, { name: "x", version: "1.2.3" }]) {
    assert.equal(parseScanFile(raw).kind, "schema");
  }
  assert.equal(parseScanFile({ version: 2, markdown: false }).kind, "schema");
});

test("errors list every issue path and English message without changing zod globals", () => {
  const before = { ...z.config() };
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
  for (const field of ["createdAt", "markdown", "provider", "model", "imageFileName", "confidence"]) {
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
    [0.145, 15], [0.285, 29], [0.575, 58], [0.725, 73], [0.9, 90], [0.995, 100], [1, 1], [1.01, 1],
    [72.5, 73], [99.7, 100], [100, 100], [101, 100], [Number.MAX_VALUE, 100],
  ]) {
    const raw = { ...minimal, confidence };
    const result = parseScanFile(raw);
    assert.equal(result.ok, true);
    assert.equal(result.file.confidence, expected, `read ${confidence}`);
    assert.equal(raw.confidence, confidence);
    assert.equal(createScanFile({ ...input, confidence }).confidence, expected, `write ${confidence}`);
    assert.equal(parseScanFile(result.file).file.confidence, expected, "normalization is idempotent");
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

test("synced tolerates any non-boolean and preserves both boolean values", () => {
  for (const synced of [true, false, undefined, null, 1, 0, "true", "yes", {}, []]) {
    assert.equal(parseScanFile({ ...minimal, synced }).file.synced, synced === true);
  }
});

test("safe image references survive write, serialization, read, and pairing", () => {
  for (const imageFileName of ["distinct.png", "other.jpeg", "scan.jpg", "文書😀.png", "a b.jpg"]) {
    const values = { ...input, imageFileName, markdown: "\r\n**alpha**\nβ", provider: " example-provider ", model: "example-model", createdAt: "2000-02-29T12:34:56.123456Z" };
    const written = createScanFile(values);
    const raw = JSON.parse(JSON.stringify(written));
    const parsed = parseScanFile(raw).file;
    assert.deepEqual(written, { ...values, version: 1 });
    assert.deepEqual(parsed, { ...written, synced: false });
    assert.equal(imageFileNameFor(parsed), imageFileName);
    assert.deepEqual(parseScanFile(parsed).file, parsed);
  }
});

test("unsafe string image references do not discard scan content", () => {
  for (const imageFileName of ["", ".jpg", "..", "../a.png", "a..b.png", "sub/a.jpg", "sub\\a.jpg", "/a.jpg", "C:a.jpg", "https:photo.jpg", "https://example.test/a.jpg", "a\0.jpg", "a\x7f.png", "a\x85.jpg", "scan.json", "scan.JPG"]) {
    assert.throws(() => createScanFile({ ...input, imageFileName }), z.ZodError);
    const file = parseScanFile({ ...minimal, imageFileName }).file;
    assert.equal(file.markdown, minimal.markdown);
    assert.equal(file.imageFileName, "");
    assert.equal(imageFileNameFor({ imageFileName }), undefined);
  }
});

test("datetime grammar preserves accepted string precision and validates calendar boundaries", () => {
  for (const createdAt of ["0000-01-01T00:00:00Z", "2000-02-29T00:00:00Z", "2024-02-29T23:59:59.123456789Z"]) {
    assert.equal(createScanFile({ ...input, createdAt }).createdAt, createdAt);
    assert.equal(parseScanFile({ ...minimal, createdAt }).file.createdAt, createdAt);
  }
  for (const createdAt of ["1900-02-29T00:00:00Z", "2023-02-29T00:00:00Z", "2024-01-01T00:00Z", "2024-01-01t00:00:00z", "2024-01-01T00:00:00+00:00", "2024-01-01T24:00:00Z", "2024-01-01T00:00:60Z", "+010000-01-01T00:00:00Z"]) {
    assert.equal(parseScanFile({ ...minimal, createdAt }).kind, "schema");
    assert.throws(() => createScanFile({ ...input, createdAt }), z.ZodError);
  }
});

test("generated confidence cases are bounded, idempotent, and agree across units", () => {
  for (let i = -100; i <= 1100; i++) {
    const confidence = i / 10;
    const written = createScanFile({ ...input, confidence });
    assert.ok(Number.isInteger(written.confidence) && written.confidence >= 0 && written.confidence <= 100);
    assert.equal(parseScanFile(written).file.confidence, written.confidence);
    if (i > 10 && i < 1000) assert.equal(createScanFile({ ...input, confidence: i / 1000 }).confidence, written.confidence);
  }
});

test("metadata cuts preserve complete visible characters within code-point budgets", () => {
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  for (const [field, limit] of [["title", 80], ["summary", 200]]) {
    for (const cluster of ["😀", "e\u0301", "👨‍👩‍👧‍👦", "🇺🇸", "👍🏽", "क्‍ष"]) {
      for (let offset = 0; offset < 10; offset++) {
        const value = "a".repeat(limit - offset) + cluster.repeat(12);
        const output = createScanFile({ ...input, [field]: value })[field];
        assert.ok(output.isWellFormed());
        assert.ok(Array.from(output).length <= limit);
        const kept = output.slice(0, -1);
        const boundaries = [...segmenter.segment(value)].map(({ index }) => index);
        assert.ok(boundaries.includes(kept.length));
        assert.ok(value.startsWith(kept));
      }
    }
    const value = "Alpha " + "文".repeat(limit);
    assert.equal(Array.from(createScanFile({ ...input, [field]: value })[field]).length, limit);
    assert.equal(createScanFile({ ...input, [field]: "😀".repeat(limit) })[field], "😀".repeat(limit));
  }
});

test("writer backs off a short partial word at the cap", () => {
  for (const [field, limit] of [["title", 80], ["summary", 200]]) {
    const prefix = "a".repeat(limit - 10);
    assert.equal(createScanFile({ ...input, [field]: prefix + " " + "b".repeat(20) })[field], prefix + "…");
  }
});
