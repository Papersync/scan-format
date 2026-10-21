// Display helpers: title and preview derivation.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveTitle, cleanMarkdownPreview, scanTitle, scanSummary } from "../dist/index.js";

describe("deriveTitle", () => {
  it("returns the first H1 heading", () => {
    assert.equal(deriveTitle("# Notes from Monday\nbody", "fb"), "Notes from Monday");
  });

  it("returns the first H2/H3 heading when no H1", () => {
    assert.equal(deriveTitle("## Subhead\n\ntext", "fb"), "Subhead");
    assert.equal(deriveTitle("### Smaller\n\ntext", "fb"), "Smaller");
  });

  it("falls back to the first non-empty line, stripping leading hashes and slicing to 60", () => {
    const md = "\n\n#### deeper heading still counts as a line\nrest";
    // No headings 1-3, so falls through to first-line strip then 60-char slice
    assert.ok(deriveTitle(md, "fb").length <= 60);
    assert.equal(deriveTitle("plain first line\nignored", "fb"), "plain first line");
  });

  it("strips Markdown syntax from the title", () => {
    assert.equal(deriveTitle("**Groceries**\n\n* oat milk", "fb"), "Groceries");
    assert.equal(deriveTitle("- [x] wake up at 7 daily\n- [>] finish the draft", "fb"), "wake up at 7 daily");
    assert.equal(deriveTitle("# While **You** Were Out\n\nbody", "fb"), "While You Were Out");
  });

  it("falls back to the first line, then the name, when the heading cleans to empty", () => {
    assert.equal(deriveTitle("# ** **\nreal line", "fb"), "fb");
    assert.equal(deriveTitle("## ** **", "fb"), "fb");
  });

  it("falls back to the provided name when markdown is empty or whitespace-only", () => {
    assert.equal(deriveTitle("", "my-fallback"), "my-fallback");
    assert.equal(deriveTitle("   \n\n   ", "my-fallback"), "my-fallback");
  });

  it("falls back to the provided name when the first line is only heading markers (cleans to empty)", () => {
    // 6 hashes exceeds the 1-3 heading match, and stripping the "#{1,6}\s+" prefix
    // from the first line then trimming leaves nothing behind.
    assert.equal(deriveTitle("######    \nbody", "my-fallback"), "my-fallback");
  });
});

describe("cleanMarkdownPreview", () => {
  it("strips headings, bold, italic, links, list markers, blockquotes, inline code and collapses whitespace", () => {
    const md =
      "# Heading\n\n**Bold** and *italic* and _underscore_ and [link](https://x).\n- one\n- two\n> quote\nLine with `code` in it.";
    const out = cleanMarkdownPreview(md);
    assert.doesNotMatch(out, /[#*_>`]|\[|\(http/);
    assert.ok(out.includes("Bold"));
    assert.ok(out.includes("italic"));
    assert.ok(out.includes("underscore"));
    assert.ok(out.includes("link"));
    assert.ok(out.includes("quote"));
    assert.ok(out.includes("code"));
  });

  it("drops task checkboxes and strikethrough markers instead of showing raw brackets", () => {
    const md =
      "Small steps still move you forward.\n\n- [x] 30-min walk after lunch\n- [ ] read 20 pages\n  - [X] nested done\n* [ ] star item\n- [>] moved item\n- ~~old plan~~ new plan";
    assert.equal(cleanMarkdownPreview(md),
      "Small steps still move you forward. 30-min walk after lunch read 20 pages nested done star item moved item old plan new plan",
    );
  });

  it("keeps bracketed text that is not a task checkbox", () => {
    assert.equal(cleanMarkdownPreview("Call [illegible] about [?Friday?]"),
      "Call [illegible] about [?Friday?]",
    );
  });

  it("slices output to 200 chars", () => {
    const long = "a".repeat(500);
    assert.equal(cleanMarkdownPreview(long).length, 200);
  });
});


it("applies separate heading and first-line caps", () => {
  assert.equal(deriveTitle("# " + "a".repeat(250), "fallback").length, 200);
  assert.equal(deriveTitle("a".repeat(250), "fallback").length, 60);
  assert.equal(deriveTitle("# ** **\n## Real heading", "fallback"), "fallback");
  assert.equal(deriveTitle("plain first line\n## Later heading", "fallback"), "Later heading");
});

it("uses normalized metadata, with derived fallbacks", () => {
  assert.equal(scanTitle({ title: "Explicit", markdown: "# Derived" }, "fallback"), "Explicit");
  assert.equal(scanTitle({ markdown: "# Derived" }, "fallback"), "Derived");
  assert.equal(scanTitle({ markdown: "" }, "fallback"), "fallback");
  assert.equal(scanSummary({ summary: "Summary" }), "Summary");
  assert.equal(scanSummary({}), undefined);
});
