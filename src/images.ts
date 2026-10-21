import type { ScanFile } from "./schema.js";

export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;

/** A plain basename with a nonempty stem and a case-sensitive image extension. */
export function isScanImageFileName(name: string): boolean {
  return !/[\\/\p{Cc}:]/u.test(name) && !name.includes("..") &&
    IMAGE_EXTENSIONS.some((extension) => name.length > extension.length && name.endsWith(extension));
}

/** Remove only one trailing, case-sensitive scan extension. */
export function scanBaseName(fileName: string): string {
  return fileName.replace(/\.(?:json|jpg|jpeg|png)$/, "");
}

/** Prefer a safe explicit name; with a listing, try .jpg, .jpeg, then .png. */
export function imageFileNameFor(
  file: Pick<ScanFile, "imageFileName">,
  options?: { jsonFileName: string; availableFileNames: readonly string[] },
): string | undefined {
  if (isScanImageFileName(file.imageFileName) && (!options || options.availableFileNames.includes(file.imageFileName))) {
    return file.imageFileName;
  }
  if (!options) return undefined;
  const base = scanBaseName(options.jsonFileName);
  return IMAGE_EXTENSIONS.map((extension) => `${base}${extension}`)
    .find((candidate) => isScanImageFileName(candidate) && options.availableFileNames.includes(candidate));
}
