# @papersync/scan-format

[![npm](https://img.shields.io/npm/v/@papersync/scan-format?label=npm&color=7786c4)](https://www.npmjs.com/package/@papersync/scan-format)
[![CI](https://github.com/Papersync/scan-format/actions/workflows/ci.yml/badge.svg)](https://github.com/Papersync/scan-format/actions/workflows/ci.yml)
[![coverage 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/Papersync/scan-format/actions/workflows/ci.yml)
[![types](https://img.shields.io/npm/types/@papersync/scan-format)](https://www.npmjs.com/package/@papersync/scan-format)
[![node](https://img.shields.io/node/v/@papersync/scan-format)](https://www.npmjs.com/package/@papersync/scan-format)
[![license MIT](https://img.shields.io/npm/l/@papersync/scan-format)](LICENSE)

The scan file format shared by the Papersync app and the Papersync Obsidian plugin.

A scan is a `<name>.json` file plus its image, saved to Google Drive, a folder, or iCloud.

## Install

```sh
npm i @papersync/scan-format zod
```

ESM only. Node 20+. Zod `^4.6.0` is a peer dependency.

## Usage

```js
import { createScanFile, parseScanFile, scanTitle } from "@papersync/scan-format";

// Write
const file = createScanFile({
  createdAt: new Date(),
  markdown: "# Meeting notes",
  confidence: 92,
  provider: "claude",
  model: "claude-sonnet-4-5",
  imageFileName: "scan.jpg",
});
const text = JSON.stringify(file);

// Read
const result = parseScanFile(JSON.parse(text));
if (result.ok) {
  console.log(scanTitle(result.file, "Untitled scan"));
} else {
  console.error(result.kind, result.message); // "schema" or "unsupported_version"
}
```

## File format

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `1` | Yes | `"1"` is also read as `1`. |
| `createdAt` | string | Yes | UTC ISO datetime, e.g. `2026-10-21T10:30:00.000Z`. |
| `markdown` | string | Yes | The transcription, kept as is. |
| `confidence` | integer 0-100 | Yes | Fractions (`0.9`) read as percentages (`90`); values are rounded and clamped. |
| `provider` | string | Yes | Any non-blank name. |
| `model` | string | Yes | |
| `imageFileName` | string | Yes | Image file name in the same folder. |
| `title` | string | No | Short page title. Written with at most 80 characters. |
| `summary` | string | No | One-sentence summary. Written with at most 200 characters. |
| `synced` | boolean | No | Plugin bookkeeping. Read as `false` when missing. |

Reading is forgiving where it is safe: unknown keys are dropped, and a missing or malformed `title` or `summary` is treated as absent.

## API

| Export | Purpose |
| --- | --- |
| `createScanFile(input)` | Build a valid, JSON-ready scan file. Throws on invalid input. |
| `parseScanFile(raw)` | Validate a decoded JSON value. Returns `{ ok: true, file }` or `{ ok: false, kind, message }`. |
| `scanFileSchema` | The Zod schema behind `parseScanFile`. |
| `SCAN_FILE_VERSION` | The version writers emit (`1`). |
| `SUPPORTED_SCAN_FILE_VERSIONS` | Versions readers accept. |
| `scanTitle(file, fallback)` | The file's title, or one derived from its markdown. |
| `scanSummary(file)` | The file's summary, or `undefined`. |
| `deriveTitle(markdown, fallback)` | First heading, else first line (60 characters), else `fallback`. |
| `cleanMarkdownPreview(markdown)` | Plain-text preview of markdown, at most 200 characters. |
| `imageFileNameFor(file, options?)` | The image that belongs to a scan file. |
| `scanBaseName(fileName)` | File name without its scan extension. |
| `isScanImageFileName(name)` | Whether a name is a scan image. |
| `IMAGE_EXTENSIONS` | `.jpg`, `.jpeg`, `.png`. |

Types: `ScanFile`, `ScanFileWrite`, `CreateScanFileInput`, `ParseScanFileResult`, `ImagePairingOptions`.

## Test fixtures

The package ships sample files in `fixtures/`. `fixtures/manifest.json` lists each file with its expected result (`ok`, `schema` or `unsupported_version`), so readers can test against the same cases:

```js
const manifestUrl = new URL("../fixtures/manifest.json", import.meta.resolve("@papersync/scan-format"));
```

## Development

```sh
npm ci
npm run check   # lint, type check, build, tests
```

Tests must keep 100% line, branch, function and statement coverage. CI fails below that.

## Versioning

- Patch: fixes that keep the format.
- Minor: new optional fields.
- Major: anything an existing reader would reject, together with a new `version` number.

See [RELEASING.md](RELEASING.md) to publish a version.

## License

MIT
