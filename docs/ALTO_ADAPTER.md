# ALTO adapter

The ALTO adapter translates safely parsed ALTO XML into the canonical `PageDocument` model.
It deliberately does not perform XSD or semantic validation; those remain separate validation
passes so that malformed-but-readable source evidence can still be inspected.

## Version policy

ALTO 4.4 is the normative implementation baseline. The adapter also accepts the official
Library of Congress v2, v3 and v4 namespace families detected by the XML ingestion layer.
Version-specific features are consumed when they exist rather than being gated behind brittle
whole-document branches.

This reflects ALTO's compatibility model: breaking changes use a new major namespace while
backward-compatible changes use a minor schema version.

## Normalized content

The adapter currently normalizes:

- `Description/MeasurementUnit`;
- source image filename, identifier and related metadata;
- `OCRProcessing` and `Processing` histories;
- pages, dimensions and v4.4 `LANG`, `OTHERLANGS`, `ROTATION` metadata;
- page spaces (`TopMargin`, `LeftMargin`, `RightMargin`, `BottomMargin`, `PrintSpace`);
- `TextBlock`, `ComposedBlock`, `Illustration`, `GraphicalElement` and generic `*Block` nodes;
- `TextLine`, `String`, `Glyph` and `Variant` content;
- rectangular geometry (`HPOS`, `VPOS`, `WIDTH`, `HEIGHT`);
- `Shape/Polygon` geometry, preferred over the bounding box when valid;
- multi-point `BASELINE` values;
- word/glyph confidence;
- `ALTERNATIVE`, `SUBS_TYPE` and `SUBS_CONTENT` text alternatives;
- line reconstruction from `String`, `SP` and `HYP` sequence;
- explicit 4.3+ reading order groups and element references.

## Loss-aware preservation

ALTO-specific fields such as `STYLEREFS`, `TAGREFS`, language/direction attributes, page
classification and processing references remain available through each node's `SourceRef`.
Style and tag declarations are exposed as document-level `SourceExtension` records rather than
being forced into format-neutral domain classes.

The adapter never silently fixes coordinates or references. Bad numeric values, malformed
polygons, unsupported shapes, missing layout/pages and dangling `IDREF`/`IDNEXT` references are
represented as parser notices where parsing can continue safely.

## API

`POST /api/alto/parse` accepts raw ALTO XML, uses the same 10 MiB streaming/security boundary as
`/api/xml/detect`, then returns the canonical document DTO. XML DTDs, entities and external
references remain forbidden before ALTO-specific code executes.

## Test fixtures

`backend/tests/fixtures/alto/` contains project-authored synthetic fixtures for v2, v3.1 and
v4.4, plus an intentionally dangling-reference fixture. Their provenance is documented beside
the files so tests do not depend on live network resources or third-party OCR corpora.

Normative reference: https://www.loc.gov/standards/alto/
