# XML ingestion and canonical page model

This document records the implementation boundary introduced for Phase 1.

## Why ingestion is a separate layer

Uploaded XML is untrusted input. ALTO and PAGE files may contain XML constructs that are
irrelevant to page inspection but dangerous in a networked application, including DTDs,
external entities and entity expansion.

HF Page Viewer therefore performs a deliberately narrow first pass before any format-specific
adapter runs:

1. enforce a byte limit;
2. parse with DTD, entity and external-reference support disabled;
3. identify the root qualified name and namespace;
4. extract only version/schema-location metadata;
5. return a typed detection result or a stable application error.

No XSD, DTD or other resource is fetched while processing an uploaded XML document.

The HTTP endpoint also applies the byte limit while streaming the request body. This keeps the
parser-level limit as defense in depth instead of relying on it as the first memory boundary.

## Detection policy

### ALTO

The detector recognizes the Library of Congress namespace family:

- `http://www.loc.gov/standards/alto/ns-v2#`
- `http://www.loc.gov/standards/alto/ns-v3#`
- `http://www.loc.gov/standards/alto/ns-v4#`

HTTPS forms on the same host are accepted as transport-equivalent namespace variants.

When `SCHEMAVERSION` is present it is reported as the document version. Otherwise the detector
reports the namespace family, for example `2.x`. The initial known-version registry covers
ALTO 2.0, 2.1, 3.0, 3.1 and 4.0 through 4.4.

Reference:
https://www.loc.gov/standards/alto/

### PAGE XML

The detector recognizes PAGE page-content namespaces of the form:

`http://schema.primaresearch.org/PAGE/gts/pagecontent/YYYY-MM-DD`

The initial supported/known baseline is `2019-07-15`. Other correctly shaped PAGE namespaces
are identified as PAGE but marked `known_version = false`; this lets the application explain
future or legacy input without pretending it has validated it.

Reference:
https://github.com/PRImA-Research-Lab/PAGE-XML

## Stable input failures

The parser exposes application exceptions rather than leaking XML-parser exceptions:

| Code | Meaning |
| --- | --- |
| `xml.too_large` | payload exceeds the configured limit |
| `xml.unsafe_construct` | DTD/entity/external-reference construct was rejected |
| `xml.malformed` | XML is not well formed |
| `xml.unsupported_format` | root element/namespace is not a recognized ALTO/PAGE family |

The API maps these to 413, 400, 400 and 422 respectively.

## Canonical domain model

Format adapters will emit `PageDocument`, a framework-independent dataclass tree. The model is
not intended to replace ALTO or PAGE. It contains the common information required by the
viewer and validator while every normalized object may keep a `SourceRef` pointing back to the
source XML.

The first model includes:

- page documents and pages;
- regions, text lines, words and glyphs;
- bounding boxes and polygons;
- baselines as polylines;
- text alternatives and confidence;
- reading-order groups/references;
- metadata and processing steps;
- parser notices;
- source element name, path, XML id and original attributes.

### Loss-aware geometry

The canonical geometry stores numeric coordinates for rendering and analysis. Original XML
attribute strings remain in `SourceRef.attributes` so normalization does not erase source
evidence.

The geometry layer intentionally does **not** reject semantically bad values such as negative
box widths. A malformed source document must remain representable so the validation engine can
produce a precise finding. Structural invariants that would make the object meaningless are
still enforced: point coordinates must be finite, a polygon needs at least three points and a
polyline at least two.

## Dependency direction

`domain` has no FastAPI, HTTP or XML-parser dependency.

```text
domain
  ↑
parsers
  ↑
services (next)
  ↑
api
```

`api.dto` is the explicit serialization boundary. React will consume DTOs, not Python parser
objects and not ALTO/PAGE XML structures directly.

## Next step

The ALTO adapter can now be implemented against two stable contracts:

- secure `ParsedXML` input;
- `PageDocument` output.

That adapter should preserve unsupported-but-safe source attributes as extensions/notices
instead of silently discarding them.
