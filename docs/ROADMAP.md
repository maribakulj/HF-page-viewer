# Roadmap

The roadmap is organized as vertical slices. Each slice should leave the application usable,
tested and deployable rather than accumulating a majestic pile of half-connected modules.

## Phase 0 — foundation (current)

- [x] Choose Docker Space deployment model.
- [x] Establish FastAPI + React/TypeScript application shell.
- [x] Document domain boundaries and validation contract.
- [x] Add CI for backend tests/lint, frontend build and Docker build.
- [ ] Establish fixture policy and vendor schema sources with provenance.

## Phase 1 — local ALTO inspection

- [ ] Secure XML parser and format/version detector.
- [ ] ALTO adapter (4.4 first, tolerant of common 2.x/3.x/4.x structures).
- [ ] Image upload and dimension inspection.
- [ ] Normalized geometry/domain models.
- [ ] OpenSeadragon image rendering.
- [ ] Region / line / word / glyph overlay toggles.
- [ ] Click/hover synchronized inspector.
- [ ] ALTO Description, Styles, processing and source-image metadata panel.
- [ ] Parser and rendering fixtures/tests.

**Exit criterion:** a user can drop a page image and ALTO file and inspect every encoded object
at the correct coordinates.

## Phase 2 — validation engine

- [ ] Local XSD validation with pinned schemas.
- [ ] ID/reference checks.
- [ ] Geometry and containment rules.
- [ ] Image/XML dimension checks.
- [ ] Confidence and text hierarchy rules.
- [ ] Reading order diagnostics.
- [ ] Filterable validation panel and viewer markers.
- [ ] JSON validation-report export.

**Exit criterion:** malformed or suspicious ALTO produces precise, navigable findings without
preventing the rest of the document from being inspected.

## Phase 3 — PAGE XML

- [ ] PAGE XML `2019-07-15` adapter.
- [ ] Regions, lines, words, glyphs, baselines and reading order.
- [ ] PAGE metadata and custom attributes.
- [ ] PAGE schema and semantic validation.
- [ ] Cross-format normalized-model parity tests.

**Exit criterion:** ALTO and PAGE share the same viewer/validation UI with format-specific detail
available when needed.

## Phase 4 — IIIF

- [ ] SSRF-safe remote resource fetcher.
- [ ] Image API 2/3 detection and `info.json` inspector.
- [ ] Presentation API 2.1/3 manifest loader.
- [ ] Canvas/image-service selection UI.
- [ ] Canvas / image / XML dimension consistency checks.
- [ ] CORS/interoperability diagnostics.
- [ ] Optional provider adapters, beginning with a BnF/Gallica convenience adapter.

**Exit criterion:** a manifest or Image API URL can supply the page image and participate in the
same validation report as local input.

## Phase 5 — research-grade tooling

- [ ] Batch/ZIP inspection with per-page reports.
- [ ] Normalized JSON export.
- [ ] Standalone Python library API for notebooks/pipelines.
- [ ] Comparison mode for two OCR/layout files over one image.
- [ ] Reading-order visualization and statistics.
- [ ] CLI validator.
- [ ] Optional Web Annotation / IIIF annotation export.
- [ ] Performance work for newspaper pages with very large word/glyph counts.

## Explicit non-goals for the first releases

- editing XML in place;
- running OCR models;
- persistent document hosting;
- user accounts/databases;
- silently repairing files.

These may become separate capabilities later, but inspection and validation need to be reliable
before the application volunteers to rewrite anyone's ground truth.
