import fs from "node:fs";

const readme = fs.readFileSync("README.md", "utf8");
const lines = readme.split(/\r?\n/);

if (lines[0] !== "---") {
  throw new Error("README.md must start with Hugging Face YAML frontmatter.");
}

const end = lines.indexOf("---", 1);
if (end === -1) {
  throw new Error("README.md Hugging Face frontmatter is not closed.");
}

const metadata = new Map();
for (const line of lines.slice(1, end)) {
  if (!line.trim() || line.trimStart().startsWith("#")) continue;
  const separator = line.indexOf(":");
  if (separator === -1) continue;
  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  metadata.set(key, value);
}

const requireValue = (key) => {
  const value = metadata.get(key);
  if (!value) throw new Error(`Missing Hugging Face Space metadata field: ${key}`);
  return value;
};

const sdk = requireValue("sdk");
if (sdk !== "static") {
  throw new Error(`HF Page Viewer must deploy as a free Static Space; received sdk=${sdk}.`);
}

const appFile = requireValue("app_file");
if (appFile !== "dist/index.html") {
  throw new Error(`Expected app_file=dist/index.html; received ${appFile}.`);
}

requireValue("app_build_command");

const shortDescription = requireValue("short_description");
if (shortDescription.length > 60) {
  throw new Error(
    `short_description is ${shortDescription.length} characters; Hugging Face allows at most 60.`,
  );
}

console.log(
  `Hugging Face metadata OK: sdk=${sdk}, app_file=${appFile}, short_description=${shortDescription.length}/60 chars.`,
);
