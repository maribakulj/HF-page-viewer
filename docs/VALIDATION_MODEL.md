# Validation model

## Goal

Validation should answer **what is wrong, where, why it matters, and what would fix it**. A red
badge saying “invalid” is not useful enough for OCR/layout work.

## Finding contract

Every rule emits zero or more findings with this conceptual shape:

```json
{
  "rule_id": "GEOM.OUT_OF_BOUNDS",
  "severity": "error",
  "message": "Word extends beyond the page bounds.",
  "location": {
    "page_id": "page-1",
    "element_id": "word-42",
    "source_path": "/alto/Layout/Page/PrintSpace/.../String[42]"
  },
  "evidence": {
    "bbox": [2410, 812, 193, 44],
    "page": [0, 0, 2500, 3500]
  },
  "remediation": "Correct the word coordinates or verify that page dimensions match the image."
}
```

Severities:

- `error`: violates a standard/structural invariant or makes geometry/text linkage unreliable;
- `warning`: suspicious inconsistency that may be intentional;
- `info`: useful interoperability or quality note.

No severity should depend on an opaque model score.

## Rule families

### XML

- `XML.WELL_FORMED`
- `XML.UNSUPPORTED_ROOT`
- `XML.UNSUPPORTED_VERSION`
- `XML.SCHEMA_INVALID`
- `XML.DUPLICATE_ID`
- `XML.DANGLING_REFERENCE`

### Geometry

- `GEOM.INVALID_BOX`
- `GEOM.INVALID_POLYGON`
- `GEOM.OUT_OF_BOUNDS`
- `GEOM.CHILD_OUTSIDE_PARENT`
- `GEOM.ZERO_AREA`
- `GEOM.IMAGE_DIMENSION_MISMATCH`
- `GEOM.NON_PIXEL_UNIT_UNRESOLVED`

### Text

- `TEXT.EMPTY_CONTENT`
- `TEXT.HIERARCHY_MISMATCH`
- `TEXT.CONFIDENCE_RANGE`
- `TEXT.HYPHENATION_INCONSISTENT`
- `TEXT.ALTERNATIVE_INCONSISTENT`

### Reading order

- `ORDER.DANGLING_REFERENCE`
- `ORDER.DUPLICATE_REFERENCE`
- `ORDER.CYCLE`
- `ORDER.MISSING_CONTENT`

### Metadata/provenance

- `META.MISSING_SOURCE_IMAGE`
- `META.MISSING_OCR_PROCESSING`
- `META.UNKNOWN_SOFTWARE_VERSION`
- `META.TIMESTAMP_INCONSISTENT`

### IIIF

- `IIIF.UNREACHABLE`
- `IIIF.UNSUPPORTED_VERSION`
- `IIIF.IMAGE_DIMENSION_MISMATCH`
- `IIIF.CANVAS_DIMENSION_MISMATCH`
- `IIIF.SERVICE_LINK_MISMATCH`
- `IIIF.CORS_MISSING`
- `IIIF.MULTIPLE_IMAGE_CANDIDATES`

## Schema validation policy

Schemas used by the validator must be vendored or otherwise version-pinned inside the project
rather than fetched live for every request. Live schema URLs are provenance identifiers, not a
runtime dependency.

Initial schema fixtures should cover:

- ALTO 4.4;
- commonly encountered ALTO 2.x/3.x/4.x variants;
- PAGE XML `2019-07-15`;
- a small set of deliberately malformed documents per format.

## Geometry policy

The validator must distinguish:

1. invalid source coordinates;
2. valid source coordinates in a non-pixel measurement unit;
3. valid coordinates that cannot yet be mapped to pixels because physical scale/DPI is absent;
4. valid coordinates mapped to image pixels;
5. mapped coordinates inconsistent with image dimensions.

It must never “fix” coordinates silently.

## Report levels

The UI and export format will expose three useful summaries without replacing findings:

- **Document**: overall format, versions, dimensions and finding counts;
- **Layer**: XML / geometry / text / order / metadata / IIIF;
- **Element**: all findings attached to a selected region/line/word/glyph.

## Determinism

Given the same inputs and validator version, the report should be stable. Any future heuristic
or ML-assisted diagnostic must be explicitly marked as advisory and separated from normative
validation rules.
