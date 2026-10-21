import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { scanTitle } from "../dist/index.js";

const title = (markdown) => scanTitle({ markdown }, "fallback");
for (const [markdown, expected] of [
  ["# Alpha\nbody", "Alpha"], ["## Beta", "Beta"], ["### Gamma", "Gamma"],
  ["intro\n#### Delta\n### Later", "Delta"], ["##### Epsilon", "Epsilon"], ["###### Zeta", "Zeta"],
  ["   # Indented", "Indented"], ["intro\nTitle\n====", "Title"], ["Title\n---", "Title"],
  ["## Heading ##", "Heading"], ["# C#", "C#"], ["# ###", "fallback"],
  ["# \r\nnext paragraph", "next paragraph"], ["# ** **\n## Real", "Real"],
  ["# ** **\nreal line", "real line"], ["\n\nalpha\r\nbeta", "alpha"], ["alpha\rbeta", "alpha"],
  ["", "fallback"], ["  \n\t \r\n", "fallback"], ["######    \nbody", "body"],
  ["```\n# code\n```\n# Real", "Real"], ["~~~\n# code\n~~~\n# Real", "Real"],
  ["````\n~~~\n```\n# code\n````\nReal", "Real"], ["    # code\n# Real", "Real"],
  ["```unclosed\n# code", "fallback"], ["\tcode\nreal", "real"],
  ["**alpha**", "alpha"], ["__alpha__", "alpha"], ["***alpha***", "alpha"],
  ["**alpha *beta* gamma**", "alpha beta gamma"], ["~~alpha~~", "alpha"],
  ["Call [illegible] about [this](https://example.test)", "Call [illegible] about this"],
  ["[?alpha?] [illegible]", "[?alpha?] [illegible]"],
  ["* [ ] alpha *urgent*", "alpha urgent"], ["* alpha *with* emphasis", "alpha with emphasis"],
  ["![alt text](image.png)", "alt text"], ["[label](https://example.test/a_(b)) done", "label done"],
  ["[my_link](https://example.test/a_b)", "my_link"], ["my_file_name.txt", "my_file_name.txt"],
  ["2 * 3 * 4 = 24", "2 * 3 * 4 = 24"], ["`a_b_c` and `**alpha**`", "a_b_c and **alpha**"],
  ["``a ` b``", "a ` b"], ["`unclosed", "`unclosed"], ["`one` `two`", "one two"],
  ["\\*escaped\\*", "*escaped*"], ["alpha\\", "alpha\\"],
  ["> - [ ] alpha", "alpha"], ["> > * [x] beta", "beta"], ["1. [ ] alpha", "alpha"],
  ["- [ ]", "fallback"], ["***", "fallback"], ["- [>] alpha", "alpha"], ["- [-] beta", "beta"],
  ["_alpha_", "alpha"], ["_alpha_ _beta_", "alpha beta"], ["* alpha", "alpha"],
  ["[label](missing", "[label](missing"], ["[]()", "fallback"], ["[**label**](x)", "label"],
  ["\\[alpha](x)", "[alpha](x)"], ["] )", "] )"],
  ["#\nbody", "body"], ["prefix\n\n---\nend", "prefix"],
]) {
  test(`title: ${JSON.stringify(markdown)}`, () => assert.equal(title(markdown), expected));
}

test("stored titles win; blank titles derive; caller fallbacks are preserved", () => {
  assert.equal(scanTitle({ title: "  Explicit  ", markdown: "# Derived" }, "name"), "Explicit");
  assert.equal(scanTitle({ title: "  ", markdown: "# Derived" }, "name"), "Derived");
  assert.equal(scanTitle({ markdown: "" }, "  name  "), "  name  ");
  assert.equal(scanTitle({ markdown: "" }, ""), "");
  assert.equal(scanTitle({ title: "a".repeat(300), markdown: "" }, "name").length, 300);
});

test("heading and first-line caps preserve Unicode and CRLF equivalence", () => {
  for (const [prefix, limit] of [["", 60], ["# ", 200]]) {
    assert.equal(title(prefix + "a".repeat(250)), "a".repeat(limit));
    for (const cluster of ["😀", "e\u0301", "👨‍👩‍👧‍👦", "🇺🇸", "👍🏽"]) {
      const out = title(prefix + "a".repeat(limit - 1) + cluster + " tail");
      assert.ok(out.isWellFormed());
      assert.ok(Array.from(out).length <= limit);
      assert.equal(out, "a".repeat(limit - 1) + (cluster === "😀" ? cluster : ""));
    }
  }
  for (const md of ["intro\n# Heading\nbody", "Title\n===\nbody", "```\n# code\n```\n# Real"]) {
    assert.equal(title(md), title(md.replaceAll("\n", "\r\n")));
    assert.equal(title(md), title(md.replaceAll("\n", "\r")));
  }
});

test("malformed markdown stays within an isolated five-second budget", () => {
  const script = `
    Intl.Segmenter = undefined;
    const { scanTitle, createScanFile } = await import(${JSON.stringify(new URL("../dist/index.js", import.meta.url).href)});
    const file = createScanFile({ createdAt: "2000-01-01T00:00:00Z", markdown: "", confidence: 1, provider: "example-provider", model: "example-model", imageFileName: "scan.jpg", title: "a".repeat(79) + "👨‍👩‍👧‍👦" });
    if (file.title !== "a".repeat(79) + "…") throw new Error("Grapheme boundary changed");
    for (const markdown of ["[a](".repeat(50000), "[".repeat(200000), " \\n".repeat(200000), "\\n".repeat(200000), "# " + "[a](".repeat(50000), "# " + " ".repeat(200000)]) {
      scanTitle({ markdown }, "fallback");
    }
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { timeout: 5000, encoding: "utf8" });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
});
