# Reproducible QC report

HF Page Viewer exports a machine-readable quality-control report for ALTO/PAGE inspection without uploading local source files.

## Purpose

The report is designed for humans, notebooks, CI jobs and future agents. It records source identity, deterministic checks and the exact correction artefact when one has been produced.

The report includes:

- report schema version and UTC generation timestamp;
- generator identity/version;
- document format, namespace and source version;
- page dimensions and normalized region/line/word/glyph counts;
- original XML SHA-256 fingerprint;
- local image SHA-256 fingerprint when present;
- active image and IIIF identifiers/dimensions;
- complete deterministic validation output;
- explicit working-copy text/bbox operations;
- corrected XML fingerprint, export warnings and preservation metadata when a corrected file exists.

## Fingerprints

Local fingerprints use browser Web Crypto SHA-256. Source files and corrected XML are hashed in-browser.

A source and corrected artefact deliberately have separate fingerprints. The source hash never pretends to identify edited bytes.

## Versioning

`report_version` versions the JSON contract. `generator.version` versions the report generator. `validation.validator_version` versions deterministic validation separately.

Corrected-output XSD evidence is introduced in QC report **1.4.0**. The corrected artefact carries its own schema status (`valid`, `invalid`, `unsupported`, or engine error) independently from the source XML schema status.

QC report **1.5.0** adds `validation_comparison`: deterministic before/after semantic+IIIF counts by severity and by `rule_id`. XSD findings are excluded from this delta because source and corrected XSD statuses belong to different serialized artefacts.

## Reproducibility boundary

`generated_at` is intentionally non-deterministic. Other report fields are deterministic for the same normalized inputs, source fingerprints, edit streams, corrected serialization and validator output, except for metadata supplied by changing remote providers.

Corrected XML uses a source-preserving DOM patch strategy. Unedited elements are preserved structurally, but serialization is not claimed to be byte-identical because XML formatting may be normalized.

The report is evidence about inspected inputs and performed checks. It is not a cryptographic signature or institutional certification.
