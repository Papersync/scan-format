import type { ScanFile } from "./schema.js";

export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;

/** Extension match is case-sensitive. */
export function isScanImageFileName(name: string): boolean {
  return IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/** Remove only a trailing scan extension; names, not paths, are expected. */
export function scanBaseName(fileName: string): string {
  return fileName.replace(/\.(?:json|jpg|jpeg|png)$/, "");
}

export interface ImagePairingOptions {
  jsonFileName: string;
  availableFileNames: readonly string[];
}

/** Prefer `imageFileName`; with a folder listing, fall back to a same-name image. */
export function imageFileNameFor(
  file: Pick<ScanFile, "imageFileName">,
  options?: ImagePairingOptions,
): string | undefined {
  if (file.imageFileName && (!options || options.availableFileNames.includes(file.imageFileName))) {
    return file.imageFileName;
  }
  if (!options) return undefined;
  const base = scanBaseName(options.jsonFileName);
  return IMAGE_EXTENSIONS.map((extension) => `${base}${extension}`)
    .find((candidate) => options.availableFileNames.includes(candidate));
}
