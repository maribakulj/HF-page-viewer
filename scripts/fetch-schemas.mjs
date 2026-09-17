import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputDir = resolve(root, "frontend/public/schemas");

const schemas = [
  {
    name: "ALTO 4.4",
    file: "alto-4-4.xsd",
    url: "https://raw.githubusercontent.com/altoxml/schema/a4e9e0338691ca934397262ef41d4e204af2f7a5/v4/alto-4-4.xsd",
    sha256: null,
  },
  {
    name: "Library of Congress XLink",
    file: "xlink.xsd",
    url: "https://www.loc.gov/standards/xlink/xlink.xsd",
    sha256: null,
  },
  {
    name: "PAGE XML 2019-07-15",
    file: "pagecontent-2019-07-15.xsd",
    url: "https://www.primaresearch.org/schema/PAGE/gts/pagecontent/2019-07-15/pagecontent.xsd",
    sha256: null,
  },
];

await mkdir(outputDir, { recursive: true });

for (const schema of schemas) {
  const response = await fetch(schema.url, {
    headers: { "user-agent": "HF-page-viewer-schema-bundler/1.0" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`${schema.name}: ${response.status} ${response.statusText} fetching ${schema.url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (schema.sha256 && digest !== schema.sha256) {
    throw new Error(`${schema.name}: SHA-256 mismatch; expected ${schema.sha256}, got ${digest}`);
  }
  const destination = resolve(outputDir, schema.file);
  if (dirname(destination) !== outputDir) throw new Error(`Unsafe schema output path: ${schema.file}`);
  await writeFile(destination, bytes);
  console.log(`${schema.name}: sha256=${digest} bytes=${bytes.byteLength}`);
  if (!schema.sha256) console.log(`${schema.name}: hash not pinned yet; record the digest above before merging.`);
}
