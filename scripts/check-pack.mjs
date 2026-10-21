import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const run = (command, args, cwd = root) => execFileSync(command, args, {
  cwd, encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"],
});
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "fixtures/manifest.json"), "utf8"));
mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/stale.js.map"), "{}");
run("npm", ["run", "build"]);
assert.equal(existsSync(join(root, "dist/stale.js.map")), false);
const expected = ["LICENSE", "README.md", "package.json", "fixtures/manifest.json",
  ...manifest.map(({ file }) => `fixtures/${file}`),
  ...readdirSync(join(root, "src")).flatMap((file) => {
    assert.match(file, /^[a-z]+\.ts$/);
    return [`dist/${file.replace(/\.ts$/, ".js")}`, `dist/${file.replace(/\.ts$/, ".d.ts")}`];
  }),
].sort();
mkdirSync(join(root, ".pack"), { recursive: true });
const [pack] = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", ".pack"]));
assert.deepEqual(pack.files.map(({ path }) => path).sort(), expected);
for (const path of expected.filter((path) => path.endsWith(".js"))) {
  const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, readFileSync(join(root, path), "utf8"));
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    assert.notEqual(token, ts.SyntaxKind.SingleLineCommentTrivia, path);
    assert.notEqual(token, ts.SyntaxKind.MultiLineCommentTrivia, path);
  }
}
for (const path of expected.filter((path) => path.endsWith(".d.ts"))) {
  assert.doesNotMatch(readFileSync(join(root, path), "utf8"), /(?:from|import\()\s*["']zod/);
}
assert.match(readFileSync(join(root, "dist/schema.d.ts"), "utf8"), /\/\*\* Normalized scan document/);
const tarball = join(root, ".pack", pack.filename);
writeFileSync(join(root, ".pack/pack.json"), JSON.stringify(pack, null, 2) + "\n");
writeFileSync(join(root, ".pack/SHA256SUMS"), `${createHash("sha256").update(readFileSync(tarball)).digest("hex")}  ${pack.filename}\n`);

const smoke = `
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as api from "@papersync/scan-format";
assert.deepEqual(Object.keys(api).sort(), ["SCAN_FILE_VERSION", "IMAGE_EXTENSIONS", "createScanFile", "parseScanFile", "isScanImageFileName", "scanBaseName", "imageFileNameFor", "scanTitle"].sort());
const manifestUrl = new URL(import.meta.resolve("@papersync/scan-format/fixtures/manifest.json"));
assert.equal(createRequire(import.meta.url).resolve("@papersync/scan-format/fixtures/manifest.json"), manifestUrl.pathname);
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
for (const entry of manifest) {
  const fixtureUrl = new URL(import.meta.resolve("@papersync/scan-format/fixtures/" + entry.file));
  const result = api.parseScanFile(JSON.parse(readFileSync(fixtureUrl, "utf8")));
  assert.equal(result.ok ? "ok" : result.kind, entry.expected);
  if (result.ok) assert.deepEqual(JSON.parse(JSON.stringify(result.file)), entry.output);
}
const input = { createdAt: "2000-02-29T12:34:56Z", markdown: "# Alpha", confidence: 0.145, provider: "example-provider", model: "example-model", imageFileName: "alpha.png", title: "A".repeat(79) + "👨‍👩‍👧‍👦" };
const written = api.createScanFile(input);
assert.equal(written.confidence, 15);
assert.equal(written.title, "A".repeat(79) + "…");
const parsed = api.parseScanFile(JSON.parse(JSON.stringify(written)));
assert.deepEqual(parsed.file, { ...written, synced: false });
assert.equal(api.imageFileNameFor(parsed.file), "alpha.png");
assert.equal(api.scanTitle({ markdown: "Call [illegible] about [this](x)" }, "fallback"), "Call [illegible] about this");
`;
const typeSource = readFileSync(join(root, "test/types.ts"), "utf8").replaceAll("../src/index.js", "@papersync/scan-format");
const peerVersions = [...new Set([pkg.peerDependencies.zod.slice(1), pkg.devDependencies.zod])];
for (const peer of peerVersions) {
  const temp = mkdtempSync(join(tmpdir(), "papersync-pack-"));
  try {
    writeFileSync(join(temp, "package.json"), JSON.stringify({ private: true, type: "module" }));
    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", tarball, `zod@${peer}`], temp);
    writeFileSync(join(temp, "smoke.mjs"), smoke);
    run(process.execPath, ["smoke.mjs"], temp);
    writeFileSync(join(temp, "types.ts"), typeSource);
    for (const [module, moduleResolution] of [["NodeNext", "NodeNext"], ["ESNext", "Bundler"]]) {
      run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--ignoreConfig", "--noEmit", "--strict", "--exactOptionalPropertyTypes", "--skipLibCheck", "false", "--target", "ES2022", "--module", module, "--moduleResolution", moduleResolution, "types.ts"], temp);
    }
    console.log(`Packed ESM, declarations, and fixtures passed with zod ${peer}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
console.log(`${pack.filename}: ${expected.length} allowed files`);
console.log(expected.join("\n"));
