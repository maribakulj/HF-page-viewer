# Browser-side correction workflow

HF Page Viewer keeps the parsed ALTO/PAGE source immutable. Corrections are represented as explicit operations and applied to a derived browser working copy.

## Current scope

The first correction tranche supports primary word-text edits only.

Workflow:

1. select a word in the overlay or inspector;
2. edit its text in the source panel;
3. apply the edit to the working copy;
4. search, overlays and semantic/IIIF validation immediately consume that working copy;
5. undo the last edit or reset all edits at any time.

The original uploaded XML bytes and parsed source document are not mutated.

## Change-set model

A word correction records:

```json
{
  "kind": "word_text",
  "target_key": "word:/source/path/String[42]",
  "page_index": 0,
  "element_id": "w42",
  "source_path": "/source/path/String[42]",
  "before": "ar-mes",
  "after": "armes"
}
```

Operations are ordered and auditable. The working document is reconstructed from the immutable parsed document plus the current operation list.

## Validation semantics

Semantic and IIIF validation run against the working copy after an edit.

Normative XSD status remains the status of the original uploaded XML until corrected XML serialization exists. The UI therefore labels it `Source XSD valid` rather than implying that an in-memory edit has itself been serialized and schema-validated.

## QC report

QC report version 1.1 records a `working_copy` section with the explicit word-text change set. The XML SHA-256 continues to identify the original uploaded source bytes.

This distinction is intentional: a QC report must never imply that the original file hash identifies an edited in-memory document.

## Next correction tranches

Planned separately:

- bbox editing for bbox-backed words/lines/regions;
- corrected ALTO/PAGE serialization;
- corrected-output fingerprinting;
- before/after validation summaries;
- explicit warning whenever lossless round-trip cannot be guaranteed.
