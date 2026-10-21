# @papersync/scan-format

[![npm](https://img.shields.io/npm/v/@papersync/scan-format?label=npm&color=7786c4)](https://www.npmjs.com/package/@papersync/scan-format)
[![CI](https://github.com/Papersync/scan-format/actions/workflows/ci.yml/badge.svg)](https://github.com/Papersync/scan-format/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Papersync/scan-format/actions/workflows/codeql.yml/badge.svg)](https://github.com/Papersync/scan-format/actions/workflows/codeql.yml)
[![coverage 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/Papersync/scan-format/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/npm-provenance-7786c4)](https://www.npmjs.com/package/@papersync/scan-format#provenance)
[![types](https://img.shields.io/npm/types/@papersync/scan-format)](https://www.npmjs.com/package/@papersync/scan-format)
[![node](https://img.shields.io/node/v/@papersync/scan-format)](https://www.npmjs.com/package/@papersync/scan-format)
[![license MIT](https://img.shields.io/npm/l/@papersync/scan-format)](LICENSE)

The scan file format shared by the Papersync app and the Papersync Obsidian plugin.

A scan is a `<name>.json` file plus its image, in the same folder.

## Install

```sh
npm install @papersync/scan-format zod
```

ESM only. Node 20+. Zod `^4.6.0` is a peer dependency.

## Usage

```ts
import { createScanFile, parseScanFile, scanTitle } from "@papersync/scan-format";

// Write
const file = createScanFile({
  createdAt: new Date(),
  markdown: "# Meeting notes\n\nExample text.",
  confidence: 92,
  provider: "example-provider",
  model: "example-model",
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

`createScanFile` throws if the input is invalid. `parseScanFile` never throws; wrap `JSON.parse` yourself.

## File format

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | `1` | Yes | `"1"` is also read as `1`. |
| `createdAt` | string | Yes | UTC ISO datetime, e.g. `2026-10-21T10:30:00.000Z`. |
| `markdown` | string | Yes | The transcription, kept as is. |
| `confidence` | integer 0-100 | Yes | A value between 0 and 1 is read as a fraction (`0.9` becomes `90`). `1` means 1. Values are rounded and clamped. |
| `provider` | string | Yes | Any non-blank name. |
| `model` | string | Yes | |
| `imageFileName` | string | Yes | A plain image file name in the same folder (`.jpg`, `.jpeg` or `.png`). No paths. |
| `title` | string | No | Short page title. Written with at most 80 characters. |
| `summary` | string | No | One-sentence summary. Written with at most 200 characters. |
| `synced` | boolean | No | Read as `false` when missing. Not written by `createScanFile`. |

Reading is forgiving where it is safe:

- Unknown keys are dropped. Keep the original JSON if you need to rewrite a file without losing them.
- A malformed `title`, `summary` or `synced` is treated as absent.
- An unsafe `imageFileName` (a path, `..`, a URL) is read as `""`. The scan is kept.
- A newer format version returns `unsupported_version`, so the reader can ask the user to update.

## API

| Export | Purpose |
| --- | --- |
| `createScanFile(input)` | Build a valid, JSON-ready scan file. |
| `parseScanFile(value)` | Validate a decoded JSON value. Returns `{ ok: true, file }` or `{ ok: false, kind, message }`. |
| `SCAN_FILE_VERSION` | The format version written (`1`). |
| `scanTitle(file, fallback)` | The stored title, else the first heading, else the first line (60 characters), else `fallback`. |
| `imageFileNameFor(file, options?)` | The image that belongs to a scan. With a folder listing, falls back to an image with the same name as the JSON file. |
| `scanBaseName(fileName)` | A file name without its `.json`, `.jpg`, `.jpeg` or `.png` extension. |
| `isScanImageFileName(name)` | Whether a name is a safe scan image name. |
| `IMAGE_EXTENSIONS` | `.jpg`, `.jpeg`, `.png`, in pairing order. |

Types: `ScanFile`, `CreateScanFileInput`, `ParseScanFileResult`.

## Test fixtures

Sample files ship with the package. `fixtures/manifest.json` lists each one with its expected result, so app and plugin tests run the same cases:

```js
import { readFileSync } from "node:fs";

const url = new URL(import.meta.resolve("@papersync/scan-format/fixtures/manifest.json"));
const manifest = JSON.parse(readFileSync(url, "utf8"));
// [{ file, expected: "ok" | "schema" | "unsupported_version", reason, output? }]
```

## Development

```sh
npm ci
npm run check        # lint, types, build, tests
npm run check:pack   # the packed tarball installs and works
```

Tests must keep 100% line, branch, function and statement coverage. CI fails below that.

## Versioning

- Patch: fixes that keep the format and the API.
- Minor (while 0.x): API changes or new optional fields.
- New format `version`: only for a change an existing reader would reject.

See [RELEASING.md](RELEASING.md) to publish a version.

## License

MIT
