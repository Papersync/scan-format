import * as z from "zod";
import { SCAN_FILE_VERSION } from "./constants.js";
import { isScanImageFileName } from "./images.js";
import { clampText } from "./text.js";

/** Normalized scan document. Unknown fields are not retained. */
export interface ScanFile {
  version: 1;
  createdAt: string;
  markdown: string;
  /** Integer in [0, 100]. */
  confidence: number;
  provider: string;
  model: string;
  /** Safe image basename, or an empty string when the reference is unusable. */
  imageFileName: string;
  synced: boolean;
  title?: string | undefined;
  summary?: string | undefined;
}

/** Writer input; confidence uses the same normalization as the reader. */
export interface CreateScanFileInput {
  createdAt: Date | string;
  markdown: string;
  confidence: number;
  provider: string;
  model: string;
  imageFileName: string;
  title?: string | undefined;
  summary?: string | undefined;
}

export type ParseScanFileResult =
  | { ok: true; file: ScanFile }
  | { ok: false; kind: "schema" | "unsupported_version"; message: string };

const text = () => z.string({ error: "Must be a string" });
const writerOptionalText = text().trim().transform((value) => value || undefined).optional();
const optionalText = z.preprocess(
  (value) => typeof value === "string" ? value : undefined,
  writerOptionalText,
);

const scanFileSchema = z.object({
  version: z.union([z.literal(1), z.literal("1")], {
    error: 'Must be 1 or "1"',
  }).transform((): typeof SCAN_FILE_VERSION => SCAN_FILE_VERSION),
  createdAt: z.iso.datetime({ error: "Must be a valid ISO datetime in UTC" }),
  markdown: text(),
  confidence: z.number({ error: "Must be a finite number" }).transform((value) => {
    // Decimal rounding removes multiplication noise at percentage half-points.
    const percent = value > 0 && value < 1 ? Number((value * 100).toPrecision(15)) : value;
    return Math.round(Math.max(0, Math.min(100, percent)));
  }),
  provider: text().refine((value) => value.trim().length > 0, {
    error: "Must be a non-empty provider name",
  }),
  model: text(),
  imageFileName: text().transform((value) => isScanImageFileName(value) ? value : ""),
  synced: z.unknown().optional().transform((value) => value === true),
  title: optionalText,
  summary: optionalText,
}, { error: "Must be an object" });

const versionEnvelope = z.object({
  version: z.union([z.number().int().min(1).max(999999999), z.string().regex(/^[1-9]\d{0,8}$/)]),
}).passthrough();

/** Validate decoded JSON; malformed versions and unrelated objects are schema errors. */
export function parseScanFile(raw: unknown): ParseScanFileResult {
  const envelope = versionEnvelope.safeParse(raw);
  if (envelope.success && Number(envelope.data.version) !== SCAN_FILE_VERSION &&
      (typeof envelope.data.markdown === "string" || typeof envelope.data.createdAt === "string")) {
    return {
      ok: false,
      kind: "unsupported_version",
      message: `Unsupported Papersync scan version ${Number(envelope.data.version)}.`,
    };
  }
  const result = scanFileSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      kind: "schema",
      message: `Invalid Papersync scan file: ${result.error.issues.map((issue) =>
        `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ).join("; ")}`,
    };
  }
  return { ok: true, file: result.data };
}

const scanFileWriteSchema = scanFileSchema.omit({ synced: true }).extend({
  imageFileName: text().refine(isScanImageFileName, { error: "Must be a plain .jpg, .jpeg or .png basename" }),
  title: writerOptionalText,
  summary: writerOptionalText,
});

/** Create numeric v1 output, omit synced, and cap title/summary at 80/200 code points. */
export function createScanFile(input: CreateScanFileInput): Omit<ScanFile, "synced"> {
  const parsed = scanFileWriteSchema.parse({
    ...input,
    version: SCAN_FILE_VERSION,
    createdAt: input.createdAt instanceof Date ? input.createdAt.toISOString() : input.createdAt,
  });
  parsed.title = clampText(parsed.title, 80);
  parsed.summary = clampText(parsed.summary, 200);
  if (parsed.title === undefined) delete parsed.title;
  if (parsed.summary === undefined) delete parsed.summary;
  return parsed;
}
