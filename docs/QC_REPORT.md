# Reproducible QC report

HF Page Viewer can export a machine-readable quality-control report for a parsed ALTO/PAGE document without uploading local source files.

## Purpose

The report is designed to be consumed by humans, notebooks, CI jobs and future agents. It is intentionally independent from React component state.

The report records:

- report schema version and UTC generation timestamp;
- generator identity/version;
- document format, namespace and source version;
- page dimensions, measurement units and normalized region/line/word/glyph counts;
- local XML SHA-256 fingerprint, file name, byte size and media type;
- local image SHA-256 fingerprint when a local raster is loaded;
- active viewer image dimensions/source kind;
- selected IIIF resource, Canvas, painting image and Image API service identifiers when present;
- selected IIIF Canvas/image dimensions when known;
- the complete deterministic validation report, including validator version, XSD status and findings.

## Fingerprints

Local file fingerprints use the browser Web Crypto API and SHA-256. Bytes are read locally with `File.arrayBuffer()`; hashing does not upload the source file.

A fingerprint is represented as:

```json
{
  "algorithm": "sha256",
  "hex": "…",
  "bytes": 12345,
  "name": "page.xml",
  "media_type": "application/xml"
}
```

Remote IIIF resources are identified by their normalized public identifiers rather than downloaded and hashed as part of this report.

## Versioning

`report_version` versions the JSON contract. `generator.version` versions the report generator implementation. `validation.validator_version` continues to version deterministic validation behavior separately.

Changing validation rules therefore does not silently redefine the QC report envelope, and changing the report envelope does not pretend to be a validator change.

## Reproducibility boundary

`generated_at` is intentionally non-deterministic. For the same normalized inputs, source fingerprints and validator output, all other report fields are deterministic except where a remote provider itself supplies changing identifiers or metadata.

The report is evidence about the inspected inputs and the checks performed. It is not a cryptographic signature or a certification by the source institution.

## Future correction workflow

The correction tranche will preserve the original source as immutable input and record edits as an explicit change set. Corrected exports and QC reports should eventually link:

- original source fingerprint;
- applied edit operations;
- corrected document fingerprint;
- before/after validation summaries.

This keeps Inspector-ALTO useful as a deterministic control layer behind human and agentic OCR workflows without turning it into a full OCR project-management platform.
