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
    sha256: "2d1ba4b0ce268c4ed763f718cfb9b1ab67ac952caf5bcffa5fc314179cb0866b",
  },
  {
    name: "Library of Congress METS XLink v2 (OCR-D mirror)",
    file: "xlink.xsd",
    url: "https://raw.githubusercontent.com/OCR-D/core/c9272c82b2f4bf62ca7fa6773c00980a7b8e67b3/src/ocrd_validators/xlink.xsd",
    sha256: "f1f5bb6003165cdd8f6c1fcc32f8fd1f965e1681010f3b9806d9460bcffa8a3c",
  },
  {
    name: "PAGE XML 2019-07-15",
    file: "pagecontent-2019-07-15.xsd",
    url: "https://www.primaresearch.org/schema/PAGE/gts/pagecontent/2019-07-15/pagecontent.xsd",
    sha256: "5d7da5af5f5e06d3b9cd1e78b407ffca1862f78ad9823ed89c302fb6409932d5",
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
  if (digest !== schema.sha256) {
    throw new Error(`${schema.name}: SHA-256 mismatch; expected ${schema.sha256}, got ${digest}`);
  }
  const destination = resolve(outputDir, schema.file);
  if (dirname(destination) !== outputDir) throw new Error(`Unsafe schema output path: ${schema.file}`);
  await writeFile(destination, bytes);
  console.log(`${schema.name}: sha256=${digest} bytes=${bytes.byteLength}`);
}
