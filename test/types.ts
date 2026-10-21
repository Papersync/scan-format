import { createScanFile, parseScanFile, type ScanFile, type CreateScanFileInput, type ParseScanFileResult } from "../src/index.js";

const input: CreateScanFileInput = {
  createdAt: new Date(), markdown: "", confidence: 72.5,
  provider: "example-provider", model: "example-model", imageFileName: "scan.png",
};
const written: Omit<ScanFile, "synced"> = createScanFile(input);
// @ts-expect-error Writer output omits synced.
void written.synced;
const result: ParseScanFileResult = parseScanFile(written);
if (result.ok) {
  const version: 1 = result.file.version;
  const synced: boolean = result.file.synced;
  void version;
  void synced;
} else {
  const kind: "schema" | "unsupported_version" = result.kind;
  void kind;
}
// @ts-expect-error createdAt is a Date or string.
createScanFile({ ...input, createdAt: 123 });
// @ts-expect-error Writer metadata is typed.
createScanFile({ ...input, title: 3 });
// @ts-expect-error Schemas are not public API.
import { scanFileSchema } from "../src/index.js";
void scanFileSchema;
