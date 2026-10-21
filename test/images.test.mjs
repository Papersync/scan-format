import assert from "node:assert/strict";
import { test } from "node:test";
import { IMAGE_EXTENSIONS, isScanImageFileName, scanBaseName, imageFileNameFor } from "../dist/index.js";

test("image discovery supports the three case-sensitive extensions", () => {
  assert.deepEqual(IMAGE_EXTENSIONS, [".jpg", ".jpeg", ".png"]);
  for (const extension of IMAGE_EXTENSIONS) assert.equal(isScanImageFileName(`scan${extension}`), true);
  for (const name of ["scan.json", "scan.JPG", "scan.jpeg.tmp", "scan.webp", "jpg", ""]) assert.equal(isScanImageFileName(name), false);
});

test("base names remove only the trailing recognized scan extension", () => {
  for (const extension of [".json", ...IMAGE_EXTENSIONS]) assert.equal(scanBaseName(`scan.json.part${extension}`), "scan.json.part");
  for (const name of ["scan", "scan.JSON", "scan.webp", "scan.json.backup", ""]) assert.equal(scanBaseName(name), name);
});

test("pairing prefers the explicit name, including a different base, and can probe stale metadata", () => {
  assert.equal(imageFileNameFor({ imageFileName: "different.png" }), "different.png");
  assert.equal(imageFileNameFor({ imageFileName: "" }), undefined);
  const options = { jsonFileName: "scan.json", availableFileNames: ["scan.jpg", "scan.jpeg", "scan.png", "different.png"] };
  assert.equal(imageFileNameFor({ imageFileName: "different.png" }, options), "different.png");
  assert.equal(imageFileNameFor({ imageFileName: "scan.png" }, options), "scan.png");
  assert.equal(imageFileNameFor({ imageFileName: "missing.jpg" }, options), "scan.jpg");
  assert.equal(imageFileNameFor({ imageFileName: "" }, options), "scan.jpg");
  assert.equal(imageFileNameFor({ imageFileName: "" }, { ...options, availableFileNames: ["scan.jpeg", "scan.png"] }), "scan.jpeg");
  assert.equal(imageFileNameFor({ imageFileName: "stale.png" }, { ...options, availableFileNames: ["scan.png"] }), "scan.png");
  assert.equal(imageFileNameFor({ imageFileName: "" }, { ...options, availableFileNames: [] }), undefined);
  assert.equal(imageFileNameFor({ imageFileName: "missing.png" }, { ...options, availableFileNames: ["scanner.jpg", "scan-thumb.jpg"] }), undefined);
});

test("pairing never selects unsafe names, even when they appear in a listing", () => {
  for (const base of ["../a", "a/b", "a\\b", "/a", "C:a", "https:a", "a..b", "a\0b", ""]) {
    for (const extension of IMAGE_EXTENSIONS) {
      const imageFileName = base + extension;
      assert.equal(isScanImageFileName(imageFileName), false);
      assert.equal(imageFileNameFor({ imageFileName }, { jsonFileName: base + ".json", availableFileNames: [imageFileName] }), undefined);
    }
  }
  assert.equal(imageFileNameFor({ imageFileName: "scan.json" }, { jsonFileName: "scan.json", availableFileNames: ["scan.json", "scan.jpg"] }), "scan.jpg");
});

test("generated listing combinations preserve membership and deterministic precedence", () => {
  const candidates = ["scan.jpg", "scan.jpeg", "scan.png", "other.png"];
  for (let mask = 0; mask < 16; mask++) {
    const availableFileNames = candidates.filter((_, i) => mask & (1 << i)).reverse();
    for (const imageFileName of [...candidates, "", "../scan.jpg"]) {
      const selected = imageFileNameFor({ imageFileName }, { jsonFileName: "scan.json", availableFileNames });
      const expected = availableFileNames.includes(imageFileName) ? imageFileName : candidates.slice(0, 3).find((candidate) => availableFileNames.includes(candidate));
      assert.equal(selected, expected);
      if (selected) assert.ok(availableFileNames.includes(selected) && isScanImageFileName(selected));
    }
  }
});
