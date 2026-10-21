# @papersync/scan-format

The shared scan file contract for Papersync and the Papersync Obsidian plugin. A scan is a `<name>.json` document and an image in the same folder.

```sh
npm install @papersync/scan-format zod
```

ESM, Node >=20, Zod ^4.6.0. TypeScript supports NodeNext and Bundler resolution. Text truncation uses pinned Unicode grapheme rules and does not require `Intl.Segmenter`. No CommonJS build is provided.

```ts
import { createScanFile, parseScanFile, scanTitle } from "@papersync/scan-format";

const file = createScanFile({
  createdAt: new Date(),
  markdown: "# A paper note\n\nExample text.",
  confidence: 92,
  provider: "example-provider",
  model: "example-model",
  imageFileName: "scan.jpg",
});
const json = JSON.stringify(file);

// JSON syntax errors and decoded-document validation are separate boundaries.
let decoded: unknown;
try {
  decoded = JSON.parse(json);
} catch {
  throw new Error("Invalid JSON syntax");
}
const result = parseScanFile(decoded);
if (result.ok) {
  console.log(scanTitle(result.file, "Untitled"), result.file.summary);
} else {
  console.log(result.kind, result.message);
}
```

## Format v1

| Field | Contract |
| --- | --- |
| `version` | Writer emits `1`; reader accepts `1` or `"1"`. |
| `createdAt` | Valid calendar date with four-digit year, uppercase `T`/`Z`, and seconds: `YYYY-MM-DDTHH:mm:ss[.fraction]Z`. Offsets, leap seconds, and hour 24 are rejected. String precision is preserved; `Date` inputs use `toISOString()`. |
| `markdown` | Required string, preserved verbatim; empty is allowed. |
| `confidence` | Required finite number. Both boundaries multiply values strictly between 0 and 1 by 100, clamp to [0, 100], and round to an integer. Exactly `1` means **1**, while `0.995` means 100; `0.145` rounds to 15. Decimal scaling noise is corrected before rounding. |
| `provider` | Required nonblank string; whitespace is preserved. Names are unrestricted. |
| `model` | Required string, including empty. |
| `imageFileName` | Required string. Safe names have a nonempty stem and `.jpg`, `.jpeg`, or `.png` extension, case-sensitive. Slashes, backslashes, `..` anywhere, colons (including drive/URI prefixes), and Unicode control characters are forbidden. Writer rejects unsafe names; reader replaces them with `""` while retaining the scan. |
| `synced` | Reader preserves booleans; missing or non-boolean values become `false`. Writer omits it. |
| `title`, `summary` | Optional trimmed strings. Reader ignores non-strings and blanks and preserves overlong strings. Writer rejects non-strings and caps title/summary at 80/200 Unicode code points, including `…`, without splitting a grapheme. A partial word may be removed within 15 code points of the cut. Internal whitespace and sentence count are not normalized or validated. |

Unknown keys are stripped. Parsed output is a normalized view, **not a lossless rewrite**: preserve unknown fields separately when editing a document. Optional reader metadata can be an own key with `undefined`; writer output omits absent metadata. The writer throws a Zod validation error for invalid fields, or `RangeError` for an invalid `Date`.

`unsupported_version` requires a canonical integer version from 2 through 999999999 (number or decimal string without leading zeroes), plus a string `markdown` or `createdAt` field. It takes precedence over other field errors. Other version values and unrelated objects produce `schema`. Preserve unsupported documents until a compatible reader is available; error prose is not a structured field API.

## Exports

- `SCAN_FILE_VERSION`: `1`, independent of the npm package version.
- `createScanFile(input)`: produces `Omit<ScanFile, "synced">`.
- `parseScanFile(decoded)`: returns `ParseScanFileResult`, with `ok: true` and `file`, or `ok: false`, `kind`, and `message`.
- Types: `ScanFile`, `CreateScanFileInput`, `ParseScanFileResult`.
- `IMAGE_EXTENSIONS`: `.jpg`, `.jpeg`, `.png`, in pairing precedence order.
- `isScanImageFileName(name)`: validates the safe image basename rule above.
- `scanBaseName(name)`: removes one trailing, case-sensitive `.json`, `.jpg`, `.jpeg`, or `.png`; it does not validate paths.
- `imageFileNameFor(file, options?)`: returns a safe image name or `undefined`. Without options, uses the safe explicit reference. With `{ jsonFileName, availableFileNames }`, prefers a listed safe reference, then a listed image with the JSON basename in extension precedence order. Comparisons are exact and case-sensitive.
- `scanTitle(file, fallback)`: uses a nonblank trimmed stored title, without a length cap. Otherwise selects the first nonempty cleaned H1–H6 or setext heading outside fenced/indented code (200 code-point cap), then the first nonempty cleaned line (60 code-point cap), then the supplied fallback unchanged. Cuts preserve graphemes. LF, CRLF, and CR are supported.

Title derivation is a bounded Markdown heuristic: it handles basic emphasis, escapes, code spans, inline links/images, quotes, lists, and one-character task statuses. It scans the document once and cleans at most 4096 code points of each candidate line; it is not a full Markdown renderer.

```ts
import { imageFileNameFor } from "@papersync/scan-format";
const name = imageFileNameFor({ imageFileName: "" }, {
  jsonFileName: "scan.json",
  availableFileNames: ["scan.png", "scan.jpeg"],
}); // "scan.jpeg"
```

## Fixtures and development

Node tooling can resolve the public fixture paths:

```js
import { readFileSync } from "node:fs";
const url = new URL(import.meta.resolve("@papersync/scan-format/fixtures/manifest.json"));
const manifest = JSON.parse(readFileSync(url, "utf8"));
```

The manifest is an array of `{ file, expected, reason, output? }`. `expected` is `ok`, `schema`, or `unsupported_version`. Every `ok` case specifies the complete JSON-serializable normalized `output`. Each `file` is relative to the manifest and also resolves through `@papersync/scan-format/fixtures/<file>`.

Run `npm ci`, `npm run check`, and `npm run check:pack`. Checks cover lint, types, behavior, 100% coverage, clean builds, the exact tarball file list, installed ESM/types, and fixture resolution with both minimum and locked Zod versions. Builds remove `dist`; published JavaScript contains no comments or source maps, and declarations retain JSDoc.

Persisted format versions describe wire interpretation. npm API removals, normalization changes, or runtime/peer support changes can require coordinated upgrades without changing the persisted version. Incompatible changes during 0.x use the next minor; compatible fixes use patches. Adding an optional field does not make parsing/reserializing lossless.

[Release guide](https://github.com/Papersync/scan-format/blob/main/RELEASING.md). MIT licensed.
