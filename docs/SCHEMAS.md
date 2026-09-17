# Pinned XML schemas

HF Page Viewer performs normative XSD validation entirely in the browser. Runtime validation never downloads a schema from a document-supplied URL or from an upstream standards website.

## Build and runtime model

1. GitHub Actions runs `scripts/fetch-schemas.mjs` before tests and the production build.
2. Every schema resource is fetched from an explicit upstream URL and verified against a hard-coded SHA-256 digest.
3. Verified files are written to `frontend/public/schemas/` and copied by Vite into `dist/schemas/`.
4. The production Static Space receives the already-built `dist/` tree.
5. At runtime the XSD Worker fetches only same-origin `schemas/*` assets from the deployed Space.
6. XSD imports/includes are resolved through a closed in-memory `libxml2-wasm` input provider. No arbitrary network resolution is enabled.

A changed upstream file therefore fails CI at the digest check instead of silently changing validation behaviour.

## Registry

### ALTO 4.4

- Registry id: `alto-4.4`
- Namespace: `http://www.loc.gov/standards/alto/ns-v4#`
- Source format/version: `alto` / `4.4`
- Upstream repository: `altoxml/schema`
- Pinned upstream commit: `a4e9e0338691ca934397262ef41d4e204af2f7a5`
- Upstream path: `v4/alto-4-4.xsd`
- Bundled path: `schemas/alto-4-4.xsd`
- SHA-256: `2d1ba4b0ce268c4ed763f718cfb9b1ab67ac952caf5bcffa5fc314179cb0866b`
- Size at pin: 63,830 bytes

The ALTO schema imports the historic Library of Congress XLink schema. The original LOC schema URL currently returns 404, so the dependency is supplied from the pinned OCR-D mirror below while retaining the original import URI inside the in-memory resolver.

### METS XLink Schema v2 dependency

- Namespace: `http://www.w3.org/1999/xlink`
- Schema identity: METS XLink Schema v2, November 15, 2004
- Purpose: resolves ALTO 4.4's `xlink:simpleLink` import
- Mirror repository: `OCR-D/core`
- Pinned mirror commit: `c9272c82b2f4bf62ca7fa6773c00980a7b8e67b3`
- Mirror path: `src/ocrd_validators/xlink.xsd`
- Bundled path: `schemas/xlink.xsd`
- SHA-256: `f1f5bb6003165cdd8f6c1fcc32f8fd1f965e1681010f3b9806d9460bcffa8a3c`
- Size at pin: 3,180 bytes

The runtime provider maps the original ALTO import URL `http://www.loc.gov/standards/xlink/xlink.xsd` to this verified local buffer. An HTTPS alias is also provided in memory for defensive compatibility. Neither URL is fetched at runtime.

### PAGE XML 2019-07-15

- Registry id: `page-2019-07-15`
- Namespace: `http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15`
- Source format/version: `page_xml` / `2019-07-15`
- Upstream: PRImA Research PAGE schema endpoint
- Upstream path: `https://www.primaresearch.org/schema/PAGE/gts/pagecontent/2019-07-15/pagecontent.xsd`
- Bundled path: `schemas/pagecontent-2019-07-15.xsd`
- SHA-256: `5d7da5af5f5e06d3b9cd1e78b407ffca1862f78ad9823ed89c302fb6409932d5`
- Size at pin: 85,826 bytes

The dated PAGE namespace is itself the versioned schema identity. The digest additionally prevents an upstream file replacement from changing production validation unnoticed.

## Exact-version policy

Normative XSD validation is currently enabled only when both detected version and namespace match a registry entry exactly:

- ALTO 4.4 + ALTO v4 namespace;
- PAGE XML 2019-07-15 + its dated PAGE namespace.

Other ALTO/PAGE versions remain parseable and continue to receive deterministic semantic validation, but the UI reports `XSD not pinned for this version` instead of validating them against a nearby schema. A document must never be presented as XSD-valid against a schema it did not declare.

## libxml2/WASM policy

The current engine is `libxml2-wasm` 0.7.2. XSD work runs inside a module Web Worker.

Instance and schema parsing use:

- `XML_PARSE_NONET`;
- `XML_PARSE_NO_XXE`;
- `XML_PARSE_NO_SYS_CATALOG`;
- `XML_PARSE_BIG_LINES` for useful diagnostics on large OCR XML files.

`RECOVER` and `HUGE` are deliberately not enabled. Schema imports/includes can only resolve through the explicit in-memory resource map. WASM documents, validators and input providers are disposed/cleaned after each validation request.

## Updating a schema

Do not replace a digest merely because CI reports a mismatch.

For an intentional update:

1. inspect the upstream diff and provenance;
2. decide whether the schema registry id/version should change;
3. update the pinned source URL/commit where applicable;
4. calculate and record the new SHA-256;
5. update this document;
6. add or update conforming and non-conforming fixtures;
7. require the full browser test/build gate before merge.
