import { createScanFile, parseScanFile, scanFileSchema, type ScanFile, type ScanFileWrite } from "../src/index.js";

const written: ScanFileWrite = createScanFile({
  createdAt: new Date(), markdown: "", confidence: 72.5,
  provider: "future-provider", model: "", imageFileName: "scan.png",
});
// @ts-expect-error Writer output deliberately omits bookkeeping.
void written.synced;
const read: ScanFile = scanFileSchema.parse(written);
const version: 1 = read.version;
const synced: boolean = read.synced;
const result = parseScanFile(written);
if (result.ok) {
  const file: ScanFile = result.file;
  void file;
} else {
  const kind: "schema" | "unsupported_version" = result.kind;
  void kind;
}
void version;
void synced;
// @ts-expect-error createdAt is a Date or string, never a timestamp.
createScanFile({ createdAt: 123, markdown: "", confidence: 72, provider: "x", model: "", imageFileName: "x.jpg" });

// @ts-expect-error Writer metadata stays typed even though reads tolerate arbitrary metadata.
createScanFile({ createdAt: new Date(), markdown: "", confidence: 0.9, provider: "x", model: "", imageFileName: "x.jpg", title: 3 });
