import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const originalPath = join(here, "out", "spec-original.md");
const currentPath = join(repoRoot, "PERPETUA_BUILD_SPEC.md");

const split = (value) => value.replace(/\r\n/g, "\n").split("\n");
const original = split(readFileSync(originalPath, "utf8"));
const current = split(readFileSync(currentPath, "utf8"));

// Greedy subsequence walk: every original line must still appear, in the same relative order.
const missing = [];
let pointer = 0;
let matched = 0;

for (let index = 0; index < original.length; index += 1) {
  const needle = original[index];
  let found = -1;
  for (let cursor = pointer; cursor < current.length; cursor += 1) {
    if (current[cursor] === needle) {
      found = cursor;
      break;
    }
  }
  if (found === -1) {
    missing.push({ line: index + 1, text: needle });
  } else {
    pointer = found + 1;
    matched += 1;
  }
}

const headings = original
  .map((line, index) => ({ line, index }))
  .filter((entry) => entry.line.startsWith("## "))
  .map((entry) => entry.line);

const headingPositions = headings.map((heading) => ({
  heading,
  at: current.indexOf(heading),
}));
const headingsOutOfOrder = headingPositions.some(
  (entry, index) => index > 0 && entry.at <= headingPositions[index - 1].at,
);

const addedSections = current
  .filter((line) => /^## (\d+[ABC])\./.test(line))
  .map((line) => line.trim());

console.log(`original lines      : ${original.length}`);
console.log(`current lines       : ${current.length}`);
console.log(`original lines kept : ${matched}`);
console.log(`new section headings: ${addedSections.length}`);
console.log("");
console.log("added sections:");
for (const heading of addedSections) console.log(`  ${heading}`);
console.log("");
console.log(`original headings   : ${headings.length}`);
console.log(`headings in order   : ${headingsOutOfOrder ? "NO" : "yes"}`);

if (missing.length > 0) {
  console.log("");
  console.log(`MISSING ${missing.length} original line(s):`);
  for (const entry of missing.slice(0, 25)) {
    console.log(`  line ${entry.line}: ${entry.text}`);
  }
  process.exit(1);
}

if (matched !== original.length) {
  console.log("");
  console.log("FAILED: not every original line was matched");
  process.exit(1);
}

if (headingsOutOfOrder) {
  console.log("");
  console.log("FAILED: original headings changed order");
  process.exit(1);
}

console.log("");
console.log("PASS: every original line is still present, in the same order, and no heading moved");
