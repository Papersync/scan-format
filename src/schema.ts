import * as z from "zod";

export const SCAN_FILE_VERSION = 1;
export const SUPPORTED_SCAN_FILE_VERSIONS = [SCAN_FILE_VERSION] as const;

const text = () => z.string({ error: "Must be a string" });
const writerOptionalText = text().trim().transform((value) => value || undefined).optional();
// Display metadata must never make an otherwise readable scan disappear.
const optionalText = z.preprocess(
  (value) => typeof value === "string" ? value : undefined,
  writerOptionalText,
);

/** Read boundary: normalize v1, strip unknown keys, retain unbounded metadata. */
export const scanFileSchema = z.object({
  version: z.union([z.literal(1), z.literal("1")], {
    error: 'Must be 1 or "1"',
  }).transform((): typeof SCAN_FILE_VERSION => SCAN_FILE_VERSION),
  createdAt: z.iso.datetime({ error: "Must be a valid ISO datetime in UTC" }),
  markdown: text(),
  confidence: z.number({ error: "Must be a finite number" }).transform((value) => {
    // A value between 0 and 1 is a fraction of 100.
    const percent = value > 0 && value < 1 ? value * 100 : value;
    return Math.round(Math.max(0, Math.min(100, percent)));
  }),
  provider: text().refine((value) => value.trim().length > 0, {
    error: "Must be a non-empty provider name",
  }),
  model: text(),
  imageFileName: text(),
  synced: z.boolean({ error: "Must be a boolean" }).default(false),
  title: optionalText,
  summary: optionalText,
}, { error: "Must be an object" });

export type ScanFile = z.infer<typeof scanFileSchema>;
export type ParseScanFileResult =
  | { ok: true; file: ScanFile }
  | { ok: false; kind: "schema" | "unsupported_version"; message: string };

// A recognizable unknown version takes precedence over other field errors.
// Missing or non-string/non-number versions remain schema errors.
const versionEnvelope = z.object({ version: z.union([z.string(), z.number()]) });

export function parseScanFile(raw: unknown): ParseScanFileResult {
  const envelope = versionEnvelope.safeParse(raw);
  if (envelope.success && envelope.data.version !== 1 && envelope.data.version !== "1") {
    return {
      ok: false,
      kind: "unsupported_version",
      message: `Unsupported Papersync scan version ${JSON.stringify(envelope.data.version)}. Update the Papersync reader.`,
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

// Writers retain typed string metadata; only readers tolerate malformed extras.
const scanFileWriteSchema = scanFileSchema.omit({ synced: true }).extend({
  title: writerOptionalText,
  summary: writerOptionalText,
});

export type CreateScanFileInput = Omit<z.input<typeof scanFileWriteSchema>, "version" | "createdAt"> & {
  createdAt: Date | string;
};
/** Writer output omits reader-only bookkeeping, including its default. */
export type ScanFileWrite = Omit<ScanFile, "synced">;

function clampText(value: string | undefined, limit: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  // Count Unicode code points so a cut cannot leave half a surrogate pair.
  const characters = Array.from(trimmed);
  if (characters.length <= limit) return trimmed;
  const prefix = characters.slice(0, limit - 1).join("");
  // If the cut falls inside a word, remove the partial word when possible.
  const boundary = /\s/.test(characters[limit - 1]!) ? prefix : prefix.replace(/\s+\S*$/, "");
  return `${boundary.trimEnd()}…`;
}

export function createScanFile(input: CreateScanFileInput): ScanFileWrite {
  // The shared confidence transform validates and normalizes reads and writes.
  const parsed = scanFileWriteSchema.parse({
    ...input,
    version: SCAN_FILE_VERSION,
    createdAt: input.createdAt instanceof Date ? input.createdAt.toISOString() : input.createdAt,
  });
  parsed.title = clampText(parsed.title, 80);
  parsed.summary = clampText(parsed.summary, 200);
  // Absent optional metadata stays absent even before JSON.stringify.
  if (parsed.title === undefined) delete parsed.title;
  if (parsed.summary === undefined) delete parsed.summary;
  return parsed;
}
