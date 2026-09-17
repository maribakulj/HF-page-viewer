# Browser-side correction workflow

HF Page Viewer keeps the parsed ALTO/PAGE source immutable. Corrections are represented as explicit operations and applied to a derived browser working copy.

## Current scope

The correction workflow currently supports:

- primary word-text edits;
- numeric bbox edits for bbox-backed regions, lines and words.

Polygon geometry is not silently converted to a rectangle. Glyph geometry editing is also intentionally deferred.

Workflow:

1. select an element in the overlay or inspector;
2. edit its word text and/or rectangular geometry in the source panel;
3. apply the operation to the working copy;
4. search, overlays and semantic/IIIF validation immediately consume that working copy;
5. undo or reset text and bbox edit streams independently.

The original uploaded XML bytes and parsed source document are never mutated.

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

A bbox correction records both previous and new rectangles:

```json
{
  "kind": "bbox",
  "target_kind": "word",
  "target_key": "word:/source/path/String[42]",
  "page_index": 0,
  "element_id": "w42",
  "source_path": "/source/path/String[42]",
  "before": { "kind": "bbox", "x": 100, "y": 200, "width": 80, "height": 25 },
  "after":  { "kind": "bbox", "x": 102, "y": 198, "width": 83, "height": 27 }
}
```

Operations are ordered and auditable. The working document is reconstructed from the immutable parsed source plus the current operation streams. For multiple operations targeting the same element, the latest operation in that stream determines the current working-copy value.

## Geometry constraints

The current bbox editor accepts finite numeric `x`, `y`, `width` and `height` values and requires positive width/height. It does not prohibit out-of-page or parent-crossing edits at input time: those remain representable so the deterministic validation engine can flag them immediately with rules such as `GEOM.OUT_OF_BOUNDS` or `GEOM.CHILD_OUTSIDE_PARENT`.

This is deliberate. The editor should not hide an invalid state that the QC layer is specifically designed to diagnose.

## Validation semantics

Semantic and IIIF validation run against the working copy after every applied operation.

Normative XSD status remains the status of the original uploaded XML until corrected XML serialization exists. The UI therefore labels it `Source XSD valid` rather than implying that an in-memory correction has itself been serialized and schema-validated.

## QC report

QC report version 1.2 records a `working_copy` section with two explicit operation streams:

- `word_text_edits`;
- `bbox_edits`.

The XML SHA-256 continues to identify the original uploaded source bytes. This distinction is intentional: a QC report must never imply that the original file hash identifies an edited in-memory document.

## Next correction tranches

Planned separately:

- corrected ALTO/PAGE serialization;
- corrected-output fingerprinting;
- before/after validation summaries;
- explicit warning whenever lossless round-trip cannot be guaranteed;
- later, if justified by corpus needs, polygon/baseline editing rather than lossy rectangle conversion.
