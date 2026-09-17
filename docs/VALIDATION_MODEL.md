# Validation model

## Goal

Validation should answer **what is wrong, where, why it matters, and what would fix it**. A red badge saying “invalid” is not useful enough for OCR/layout work.

The production validator is a pure TypeScript browser-core module. It operates on normalized `PageDocument` data, so the same deterministic rules apply to ALTO and PAGE XML after parsing.

## Finding contract

The implemented report uses this shape:

```json
{
  "validator_version": "0.1.0",
  "source_format": "alto",
  "source_version": "4.4",
  "page_count": 1,
  "summary": {
    "errors": 1,
    "warnings": 0,
    "info": 0,
    "total": 1
  },
  "findings": [
    {
      "rule_id": "GEOM.OUT_OF_BOUNDS",
      "severity": "error",
      "message": "word word-42 extends beyond the encoded page bounds.",
      "target": {
        "page_index": 0,
        "element_id": "word-42",
        "node_key": "word:/alto/Layout/Page/.../String[42]",
        "source_path": "/alto/Layout/Page/.../String[42]"
      },
      "evidence": {
        "bounds": { "minX": 2410, "minY": 812, "maxX": 2603, "maxY": 856 },
        "page": { "width": 2500, "height": 3500 }
      },
      "remediation": "Correct the element coordinates or verify the page dimensions."
    }
  ]
}
```

The `node_key` is deliberately compatible with viewer selection. A finding can therefore navigate to the corresponding region, line, word or glyph without reparsing XML in the React layer.

Severities:

- `error`: violates a structural invariant or makes geometry/text linkage unreliable;
- `warning`: suspicious inconsistency that may be intentional;
- `info`: useful interoperability or quality note.

No severity depends on an opaque model score.

## Implemented deterministic rules — validator 0.1.0

### XML / identifiers

- `XML.DUPLICATE_ID`

### Geometry

- `GEOM.INVALID_BOX`
- `GEOM.INVALID_POLYGON`
- `GEOM.ZERO_AREA`
- `GEOM.OUT_OF_BOUNDS`
- `GEOM.CHILD_OUTSIDE_PARENT`
- `GEOM.IMAGE_DIMENSION_MISMATCH`
- `GEOM.NON_PIXEL_UNIT_UNRESOLVED`

Containment currently uses bounding-box containment for both boxes and polygon envelopes. That is intentionally conservative: it can miss a polygon-level containment anomaly, but it does not pretend that envelope containment is exact polygon topology.

### Text

- `TEXT.CONFIDENCE_RANGE`

### Reading order

- `ORDER.DANGLING_REFERENCE`
- `ORDER.DUPLICATE_REFERENCE`

### Metadata/provenance

- `META.MISSING_SOURCE_IMAGE`

### Validator resilience

- `VALIDATOR.RULE_FAILURE` is emitted if one rule throws unexpectedly. Other rules continue to run.

The rule registry is exported by the browser core and every rule has a stable identifier, default severity, description and deterministic evaluator.

## UI and export

The Inspector exposes a **Validation** tab with:

- error / warning / info counts;
- individual findings with source path, remediation and evidence;
- navigation from a finding to its page/overlay target;
- JSON export of the complete versioned report.

The Overview tab also exposes compact validation counts.

## Planned rule families

The following rules remain planned and should be added incrementally rather than treated as already implemented.

### XML/schema

- `XML.WELL_FORMED` is currently enforced by the parser before normalization rather than emitted as a validator finding;
- `XML.UNSUPPORTED_ROOT` and `XML.UNSUPPORTED_VERSION` are currently parser-level errors/notices;
- `XML.SCHEMA_INVALID` requires the pinned XSD/WASM tranche;
- generic `XML.DANGLING_REFERENCE` remains useful for non-reading-order references such as ALTO linkage attributes.

### Text

- `TEXT.EMPTY_CONTENT`
- `TEXT.HIERARCHY_MISMATCH`
- `TEXT.HYPHENATION_INCONSISTENT`
- `TEXT.ALTERNATIVE_INCONSISTENT`

### Reading order

- `ORDER.CYCLE`
- `ORDER.MISSING_CONTENT`

The normalized reading-order model is currently a tree, so cycle detection requires preserving graph-level source references that can actually express a cycle rather than inventing one after normalization.

### Metadata/provenance

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

These arrive with the provider-neutral IIIF adapter rather than being hard-coded into the local-file validator.

## Schema validation policy

Normative XSD validation is the next validation tranche, not part of validator 0.1.0.

Schemas must be vendored or otherwise version-pinned inside the project rather than fetched live for every request. Live schema URLs are provenance identifiers, not runtime dependencies.

Target schemas:

- ALTO 4.4;
- selected commonly encountered ALTO 2.x/3.x/4.x variants required by fixtures;
- PAGE XML `2019-07-15`.

The preferred implementation path is standards-compliant XSD validation through browser-side WebAssembly (currently `libxml2-wasm` is the leading candidate), isolated in a Web Worker with a controlled virtual filesystem for imports/includes. No document-supplied network schema fetches are permitted.

## Geometry policy

The validator distinguishes:

1. invalid source coordinates;
2. valid source coordinates in a non-pixel measurement unit;
3. valid coordinates that cannot yet be mapped to pixels because physical scale/DPI is absent;
4. valid coordinates mapped to image pixels;
5. mapped coordinates inconsistent with image dimensions.

It never “fixes” coordinates silently.

## Determinism

Given the same normalized input, image context and validator version, the report is stable. Reports deliberately contain no generation timestamp. Tests assert exact rule identifiers and deterministic equality across repeated runs.

Any future heuristic or ML-assisted diagnostic must be explicitly marked as advisory and separated from normative/deterministic validation rules.
