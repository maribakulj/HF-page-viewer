# Browser-side correction workflow

HF Page Viewer keeps the parsed ALTO/PAGE source immutable. Corrections are represented as explicit operations and applied to a derived browser working copy.

## Current scope

The correction workflow currently supports:

- primary word-text edits;
- numeric bbox edits for bbox-backed regions, lines and words;
- source-preserving corrected XML export.

Polygon geometry is not silently converted to a rectangle. Glyph geometry editing is also intentionally deferred.

Workflow:

1. select an element in the overlay or inspector;
2. edit its word text and/or rectangular geometry;
3. apply the operation to the working copy;
4. search, overlays and semantic/IIIF validation immediately consume that working copy;
5. export a corrected XML derived from the original source;
6. undo or reset text and bbox edit streams independently.

The original uploaded XML bytes and parsed source document are never mutated.

## Source-preserving XML export

Corrected XML is produced by parsing a copy of the original XML and patching only explicitly edited targets. Targets are resolved by XML ID first, then by the parser's stable source path.

Current serialization support:

- ALTO word text → `String@CONTENT`;
- ALTO region/line/word bbox → `HPOS/VPOS/WIDTH/HEIGHT`;
- PAGE word text → existing primary `TextEquiv/Unicode` or `PlainText`;
- PAGE bbox edits are **not** serialized, because PAGE geometry is polygonal and a silent rectangle→polygon conversion would be lossy.

Unsupported or unresolved operations are retained as explicit export warnings rather than silently ignored.

The strategy is `patch-original-dom`: unedited XML elements and extensions are preserved structurally. DOM serialization can normalize whitespace, quote style or formatting, so the corrected file is not claimed to be byte-identical to the original.

## Validation semantics

Semantic and IIIF validation run against the in-memory working copy after every applied operation.

Normative XSD status is now split explicitly: `Source XSD` validates the uploaded original bytes, while `Corrected XSD` validates the serialized corrected XML against the same exact pinned schema when available.

## QC report

QC report version 1.3 records:

- `word_text_edits`;
- `bbox_edits`;
- corrected XML filename;
- corrected XML SHA-256;
- applied/skipped operation counts;
- export warnings;
- preservation strategy.

The source XML SHA-256 continues to identify the original uploaded bytes. The corrected-output hash identifies the serialized corrected artifact separately.

## Before/after validation comparison

The QC layer now compares the immutable source document with the current working copy using deterministic **semantic + IIIF** findings only.

It records:
- error/warning/info counts before and after;
- signed deltas;
- per-`rule_id` before/after counts.

XSD is intentionally excluded from this numerical comparison because source XSD and corrected-output XSD describe two different serialized artefacts and already have separate evidence.

A negative finding delta is descriptive, not a quality score: the application does not infer that every reduction in warnings automatically means a better OCR.

## Remaining correction work

- later, if justified by corpus needs, polygon/baseline editing rather than lossy rectangle conversion.
