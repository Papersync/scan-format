import type { ScanFile } from "./schema.js";
import { textPrefix } from "./text.js";

interface Token { text: string; literal: boolean }

// Pair delimiters once, so an unmatched opener never rescans the remaining line.
function cleanInline(line: string): string {
  const tokens: Token[] = [];
  const pairs = new Map<number, number>();
  const brackets: number[] = [];
  const parens: number[] = [];
  const ticks = new Map<number, number[]>();
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === "\\") { i++; continue; }
    if (char === "[") brackets.push(i);
    if (char === "]" && brackets.length) pairs.set(brackets.pop()!, i);
    if (char === "(") parens.push(i);
    if (char === ")" && parens.length) pairs.set(parens.pop()!, i);
    if (char === "`") {
      const start = i;
      while (line[i + 1] === "`") i++;
      const width = i - start + 1;
      const positions = ticks.get(width) ?? [];
      positions.push(start);
      ticks.set(width, positions);
    }
  }
  const codeEnds = new Map<number, number>();
  for (const positions of ticks.values()) {
    for (let i = 0; i + 1 < positions.length; i++) codeEnds.set(positions[i]!, positions[i + 1]!);
  }
  const labelEnds = new Map<number, number>();
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === "\\" && i + 1 < line.length) {
      tokens.push({ text: line[++i]!, literal: true });
      continue;
    }
    if (char === "`") {
      const start = i;
      while (line[i + 1] === "`") i++;
      const end = codeEnds.get(start);
      if (end !== undefined) {
        const width = i - start + 1;
        tokens.push({ text: line.slice(i + 1, end), literal: true });
        i = end + width - 1;
        continue;
      }
      tokens.push({ text: line.slice(start, i + 1), literal: true });
      continue;
    }
    const labelStart = char === "!" && line[i + 1] === "[" ? i + 1 : i;
    const close = pairs.get(labelStart);
    if (line[labelStart] === "[" && close !== undefined && line[close + 1] === "(" && pairs.has(close + 1)) {
      labelEnds.set(close, pairs.get(close + 1)!);
      i = labelStart;
      continue;
    }
    const destinationEnd = labelEnds.get(i);
    if (destinationEnd !== undefined) { i = destinationEnd; continue; }
    if (char === "*" || char === "_" || char === "~") {
      const start = i;
      while (line[i + 1] === char) i++;
      tokens.push({ text: line.slice(start, i + 1), literal: false });
    } else {
      tokens.push({ text: char, literal: true });
    }
  }
  const opens = new Map<string, number>();
  const removed = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.literal) continue;
    const before = tokens[i - 1]?.text ?? "";
    const after = tokens[i + 1]?.text ?? "";
    if (token.text.startsWith("_") && /[\p{L}\p{N}]/u.test(before.slice(-1)) && /[\p{L}\p{N}]/u.test(after[0] ?? "")) continue;
    const open = opens.get(token.text);
    if (open !== undefined && before.trim()) {
      removed.add(open);
      removed.add(i);
      opens.delete(token.text);
    } else if (after.trim()) {
      opens.set(token.text, i);
    }
  }
  return tokens.filter((_, i) => !removed.has(i)).map((token) => token.text).join("").replace(/\s+/gu, " ").trim();
}

function cleanLine(line: string): string {
  // Bounded inline work; the document scan itself remains linear in input size.
  let text = textPrefix(line, 4096).trim();
  text = text.replace(/^(?:>[ \t]*)+/, "");
  text = text.replace(/^(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[^\]]\](?:[ \t]+|$))?/, "");
  text = text.replace(/^#{1,6}(?:[ \t]+|$)/, "");
  if (/^(?:[*_~ \t]*|=+|-+)$/u.test(text)) return "";
  return cleanInline(text);
}

function deriveTitle(markdown: string, fallback: string): string {
  let first = "";
  let previous = "";
  let fence = "";
  let fenceWidth = 0;
  for (const line of markdown.split(/\r\n?|\n/u)) {
    const marker = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) { fence = marker[0]!; fenceWidth = marker.length; }
      else if (marker[0] === fence && marker.length >= fenceWidth) fence = "";
      previous = "";
      continue;
    }
    if (fence || /^(?: {4}|\t)/.test(line)) { previous = ""; continue; }
    if (previous && /^[ \t]{0,3}(?:=+|-+)[ \t]*$/.test(line)) return textPrefix(previous, 200);
    const heading = /^[ \t]{0,3}#{1,6}(?:[ \t]+|$)/.exec(line);
    let content = line;
    if (heading) {
      content = line.slice(heading[0].length).trimEnd();
      let end = content.length;
      while (content[end - 1] === "#") end--;
      if (end < content.length && (end === 0 || /[ \t]/.test(content[end - 1]!))) content = content.slice(0, end);
    }
    const cleaned = cleanLine(content);
    if (heading && cleaned) return textPrefix(cleaned, 200);
    if (!first) first = cleaned;
    previous = cleaned;
  }
  return textPrefix(first, 60) || fallback;
}

/** Use a nonblank stored title, then the first heading, then a first-line title. */
export function scanTitle(file: Pick<ScanFile, "title" | "markdown">, fallback: string): string {
  return file.title?.trim() || deriveTitle(file.markdown, fallback);
}
