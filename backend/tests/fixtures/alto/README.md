# ALTO test fixtures

These XML files are synthetic, minimal test documents written specifically for HF Page Viewer.
They do not reproduce OCR content from a third-party corpus. They are modeled only on the public
ALTO element/attribute semantics maintained by the Library of Congress.

They are distributed under the repository's MIT license.

Coverage:

- `alto_4_4.xml`: processing/source metadata, styles, tags, page metadata, reading order,
  page spaces, blocks, polygon shape, baseline, word confidence, alternative/substitution,
  glyph/variant and illustration.
- `alto_3_1.xml`: v3 namespace and non-rectangular String shape.
- `alto_2_1.xml`: v2 namespace and legacy `OCRProcessing` structure.
- `alto_dangling.xml`: intentionally broken `IDREF`/`IDNEXT` references.

Normative reference: https://www.loc.gov/standards/alto/
