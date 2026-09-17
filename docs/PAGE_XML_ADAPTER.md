# PAGE XML browser adapter

The production Static Space parses PAGE XML directly in the browser and normalizes it into the same `PageDocument` structure used by ALTO.

## Initial baseline

- PRImA PAGE page-content namespace `2019-07-15` is the normative baseline.
- Other dated PAGE page-content namespaces are accepted through the compatibility adapter and produce a parser notice so version drift is visible.
- No XML is uploaded to a server.

## Normalized constructs

- `PcGts/Metadata` → source metadata and metadata extensions;
- `Page` → pixel dimensions, image filename and orientation;
- all `*Region` elements → normalized regions with polygon geometry;
- `TextRegion/TextLine/Word/Glyph` → shared text hierarchy;
- `Coords` → polygon;
- `Baseline` → polyline;
- `TextEquiv/Unicode` → text alternatives with confidence;
- `ReadingOrder` groups and `RegionRef[Indexed]` → shared reading-order model;
- original attributes and source paths → `SourceRef` for inspection and later validation.

Dangling reading-order references and malformed coordinates are surfaced as parser notices rather than silently repaired.

## Next work

Normative XSD validation is deliberately separate from parsing. It will use pinned schemas and a browser-side WebAssembly validator so the free Static Space remains serverless.
