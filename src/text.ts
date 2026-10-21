import { graphemeSegments } from "unicode-segmenter/grapheme";

/** Take a complete-grapheme prefix within a Unicode code-point budget. */
export function textPrefix(text: string, limit: number): string {
  let length = 0;
  let end = 0;
  for (const { segment, index } of graphemeSegments(text)) {
    length += Array.from(segment).length;
    if (length > limit) break;
    end = index + segment.length;
  }
  return text.slice(0, end);
}

export function clampText(value: string | undefined, limit: number): string | undefined {
  if (!value) return undefined;
  const prefix = textPrefix(value, limit);
  if (prefix === value) return value;
  let kept = textPrefix(value, limit - 1);
  const boundary = kept.search(/\s+\S*$/u);
  // Back off a short partial word without discarding a long unspaced prefix.
  if (boundary > 0 && !/\s/u.test(value[kept.length]!) && Array.from(kept.slice(boundary)).length <= 15) {
    kept = kept.slice(0, boundary);
  }
  return `${kept.trimEnd()}…`;
}
