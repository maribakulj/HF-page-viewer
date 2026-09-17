# Validation model

## Goal

Validation should answer **what is wrong, where, why it matters, and what would fix it**. A red badge saying “invalid” is not useful enough for OCR/layout work.

The production validator has two browser-local layers:

1. deterministic semantic rules over normalized `PageDocument` data;
2. normative XSD validation for explicitly pinned schema versions.

Both layers remain independent of React and no production validation request reaches an application server.

## Finding contract

The combined exported report is version `0.2.0` and includes both findings and explicit schema-validation status:

```json
{
  "validator_version": "0.2.0",
  "source_format": "alto",
  "source_version": "4.4",
  "page_count": 1,
  "schema_validation": {
    "status": "invalid",
    "schema_id": "alto-4.4",
    "schema_label": "ALTO 4.4",
    "diagnostic_count": 1
  },
  "summary": {
    "errors": 1,
    "warnings": 0,
    "info": 0,
    "total": 1
  },
  "findings": [
    {
      "rule_id": "XML.SCHEMA_INVALID",
      "severity": "error",
      "message": "The attribute CONTENT is required.",
      "target": {
        "page_index": null,
        "element_id": null,
        "node_key": null,
        "source_path": "/*/*[2]/*/*/*/*"
      },
      "evidence": {
        "schema_id": "alto-4.4",
        "line": 12,
        "xpath": "/*/*[2]/*/*/*/*"
      },
      "remediation": "Correct the XML so it conforms to ALTO 4.4."
    }
  ]
}
```

The `node_key` used by semantic findings is deliberately compatible with viewer selection. XSD diagnostics come from libxml2 and therefore expose source line/XPath evidence when the schema engine can provide it rather than pretending that a normalized viewer node is always available.

Severities:

- `error`: violates a structural invariant or normative schema constraint;
- `warning`: suspicious inconsistency that may be intentional;
- `info`: useful interoperability or quality note.

No severity depends on an opaque model score.

## Semantic rule registry

Implemented stable rule IDs:

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

Containment currently uses bounding-box containment for boxes and polygon envelopes. That is intentionally conservative: envelope containment is not presented as exact polygon topology.

### Text

- `TEXT.CONFIDENCE_RANGE`

### Reading order

- `ORDER.DANGLING_REFERENCE`
- `ORDER.DUPLICATE_REFERENCE`

### Metadata/provenance

- `META.MISSING_SOURCE_IMAGE`

### Validator resilience

- `VALIDATOR.RULE_FAILURE` is emitted if one semantic rule throws unexpectedly. Other rules continue to run.

## Normative XSD validation

Implemented in validator 0.2.0:

- `XML.SCHEMA_INVALID`

Pinned normative baselines:

- ALTO 4.4 with namespace `http://www.loc.gov/standards/alto/ns-v4#`;
- PAGE XML `2019-07-15` with its dated namespace.

A version/namespace must match the schema registry exactly. Other ALTO/PAGE variants remain parseable and receive semantic validation, but the schema layer reports `unsupported` rather than applying the nearest schema.

### Runtime architecture

- engine: `libxml2-wasm` 0.7.2;
- execution: dedicated ES-module Web Worker;
- schema assets: SHA-256 verified during CI/build, then bundled into `dist/schemas/`;
- runtime schema loading: same-origin only;
- XSD imports/includes: closed in-memory input provider;
- no document-supplied network schema resolution;
- schema/document/validator WASM objects are explicitly disposed after each request.

Parser flags include `XML_PARSE_NONET`, `XML_PARSE_NO_XXE`, `XML_PARSE_NO_SYS_CATALOG` and `XML_PARSE_BIG_LINES`. `RECOVER` and `HUGE` are intentionally not enabled.

See [`SCHEMAS.md`](SCHEMAS.md) for upstream provenance, pinned commits/URLs and SHA-256 values.

### Schema-validation states

The UI and JSON export distinguish:

- `validating`: Worker still running;
- `valid`: exact pinned XSD completed successfully;
- `invalid`: schema diagnostics converted to `XML.SCHEMA_INVALID` findings;
- `unsupported`: no exact schema is pinned for this detected version/namespace;
- `error`: schema asset loading or validation engine failed.

An `unsupported` or `error` state is never represented as XSD-valid.

## UI and export

The Inspector exposes a **Validation** tab with:

- semantic + XSD error/warning/info counts;
- explicit XSD status/schema label;
- individual findings with source path, remediation and evidence;
- navigation from semantic findings to their page/overlay target;
- libxml2 line/XPath evidence for XSD findings;
- JSON export of the complete versioned report including `schema_validation`.

The Overview/top bar also exposes compact validation status.

## Tests

The browser test suite covers:

- semantic rule determinism and exact rule IDs;
- simple in-memory XSD valid/invalid/malformed cases through real `libxml2-wasm`;
- exact schema-registry matching;
- representative ALTO 4.4 validated against the pinned official ALTO schema + XLink dependency;
- representative PAGE 2019-07-15 validated against the pinned official PAGE schema;
- deliberately invalid ALTO/PAGE variants rejected by the corresponding official XSD;
- mapping XSD diagnostics into exported `XML.SCHEMA_INVALID` findings.

The build gate also verifies that all pinned XSD assets are present in the final static `dist/` tree.

## Remaining rule families

### XML/parser

- `XML.WELL_FORMED` remains a parser prerequisite rather than a post-parse finding;
- `XML.UNSUPPORTED_ROOT` / unsupported format handling remain parser-level errors/notices;
- generic `XML.DANGLING_REFERENCE` remains useful for non-reading-order references such as ALTO linkage attributes;
- additional legacy ALTO/PAGE XSDs can be pinned incrementally when representative fixtures justify them.

### Text

- `TEXT.EMPTY_CONTENT`
- `TEXT.HIERARCHY_MISMATCH`
- `TEXT.HYPHENATION_INCONSISTENT`
- `TEXT.ALTERNATIVE_INCONSISTENT`

### Reading order

- `ORDER.CYCLE`
- `ORDER.MISSING_CONTENT`

The normalized reading-order model is currently a tree, so cycle detection requires preserving graph-level source relationships that can actually express a cycle rather than inventing one after normalization.

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

## Geometry policy

The validator distinguishes:

1. invalid source coordinates;
2. valid source coordinates in a non-pixel measurement unit;
3. valid coordinates that cannot yet be mapped to pixels because physical scale/DPI is absent;
4. valid coordinates mapped to image pixels;
5. mapped coordinates inconsistent with image dimensions.

It never “fixes” coordinates silently.

## Determinism

Given the same normalized input, image context, schema bundle and validator version, the report is stable. Reports deliberately contain no generation timestamp.

Schema resources are identified by pinned source + SHA-256. A changed upstream file fails the build-time digest check rather than silently changing validation behaviour.

Any future heuristic or ML-assisted diagnostic must be explicitly marked as advisory and separated from normative/deterministic validation rules.
