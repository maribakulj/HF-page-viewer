# Architecture

## 1. Problem boundary

HF Page Viewer is not an OCR engine and should not become one by accident. Its core job is to
**inspect, explain and validate page-level OCR/layout representations** against the image they
claim to describe.

The architecture therefore separates four concerns:

1. ingestion of local or remote resources;
2. parsing and normalization of ALTO/PAGE/IIIF;
3. deterministic validation and analysis;
4. interactive visualization.

The frontend is a client of these capabilities, not their owner.

## 2. Target system

```text
Local files / URLs / IIIF
          │
          ▼
  Source ingestion layer
  - upload limits
  - media sniffing
  - SSRF-safe fetching
  - image metadata
          │
          ▼
     Format adapters
  ┌──────────┬──────────┐
  │   ALTO   │ PAGE XML │       IIIF adapter
  └────┬─────┴────┬─────┘            │
       └──────┬───┘                   │
              ▼                       │
      Normalized PageDocument ◄───────┘
              │
      ┌───────┴────────┐
      ▼                ▼
Validation engine   Analysis/stats
      │                │
      └───────┬────────┘
              ▼
         FastAPI API
              │
              ▼
 React + TypeScript + OpenSeadragon
```

## 3. Normalized domain model

The canonical model is intentionally smaller than either source standard but is **loss-aware**.
Every normalized node keeps source identity and source attributes so that diagnostics can point
back to the original XML without flattening away useful information.

Planned core entities:

- `PageDocument`: source format/version, metadata, provenance, one or more pages;
- `Page`: source image reference, width/height, measurement unit, regions, reading order;
- `Region`: semantic/layout type, polygon/bounding box, child lines/regions;
- `TextLine`: polygon/bbox, baseline, text alternatives, words;
- `Word`: polygon/bbox, text, confidence, glyphs;
- `Glyph`: geometry, text and confidence;
- `ReadingOrder`: ordered/unordered groups and references;
- `SourceRef`: XML id, XPath-like location, original element/attribute names;
- `MetadataEntry`: normalized label/value plus source path;
- `ProcessingStep`: OCR software, version, timestamp, settings and provenance;
- `ValidationFinding`: rule id, severity, location, evidence, expected/actual and remediation.

Geometry primitives (`Point`, `Polygon`, `BBox`) are shared across formats. Source coordinates
are retained exactly; conversion or scale is represented explicitly.

## 4. Backend packages

The backend will evolve toward this dependency direction:

```text
hf_page_viewer.domain          no framework dependencies
hf_page_viewer.parsers         -> domain
hf_page_viewer.validation      -> domain
hf_page_viewer.iiif            -> domain
hf_page_viewer.services        -> parsers/validation/iiif
hf_page_viewer.api             -> services
hf_page_viewer.main            -> api
```

Rules:

- `domain` must never import FastAPI, HTTP clients or XML libraries;
- parsers perform format translation, not validation policy;
- validation rules must be independently testable;
- IIIF HTTP access lives behind a fetcher interface so tests use local fixtures;
- API response models are versioned separately from internal parser implementation.

## 5. Frontend architecture

The UI is built around one synchronized selection state.

### Main workspace

- **Source panel**: image/XML uploads, URL/manifest input, detected format and dimensions.
- **Viewer**: OpenSeadragon image with SVG/canvas overlays.
- **Inspector**: Overview, Metadata, Validation, Structure, IIIF and Raw XML tabs.
- **Status strip**: counts, zoom, selected element and validation summary.

### Overlay layers

Each layer can be enabled independently:

- page/print space;
- text and non-text regions;
- text lines;
- words;
- glyphs;
- baselines;
- reading order;
- validation markers.

The renderer consumes normalized geometry only. ALTO-specific and PAGE-specific quirks belong
in the adapters.

### Interaction model

Clicking or hovering any overlay selects the corresponding domain object and synchronizes:

- geometry highlight;
- structure tree node;
- transcription/text alternatives;
- confidence and source attributes;
- diagnostics attached to that node.

This prevents the usual viewer failure mode where the picture, XML tree and error list are
three unrelated little bureaucracies.

## 6. Validation pipeline

Validation runs in layers so a malformed document can still yield useful findings:

1. safe XML parse / well-formedness;
2. format and version detection;
3. XSD/schema validation when an appropriate local schema is available;
4. structural integrity (IDs, references, required relationships);
5. geometry validity and containment;
6. text hierarchy consistency;
7. source-image consistency;
8. reading-order consistency;
9. IIIF consistency and interoperability checks;
10. advisory quality diagnostics.

A single failure does not abort later checks unless the required input is unavailable.

## 7. IIIF integration

The IIIF layer should accept:

- an Image API `info.json` URL;
- an Image API service base URL;
- a Presentation 2.1 or 3.0 manifest;
- eventually, convenience identifiers such as ARKs through provider adapters.

Checks include:

- API/version/profile detection;
- image and canvas dimensions;
- image service linkage;
- canonical image request construction;
- CORS headers where relevant to browser interoperability;
- XML/image/Canvas dimension mismatches;
- manifest metadata and rights exposure;
- multiple candidate images/canvases, surfaced rather than guessed.

Provider-specific logic (BnF, LoC, etc.) must remain optional adapters.

## 8. Security and resource controls

A public Space processes hostile input by definition.

Required controls before remote fetching ships:

- parse XML with DTD/network/entity resolution disabled;
- reject or tightly control `file:`, `ftp:` and non-HTTP(S) schemes;
- resolve DNS and block loopback, link-local, private and reserved targets;
- revalidate every redirect target;
- enforce connection/read timeouts and response-size limits;
- cap upload sizes and image pixel counts;
- never interpolate XML/metadata into executable HTML;
- keep user sessions ephemeral and isolated;
- do not persist uploads by default.

## 9. Deployment model

A multi-stage Docker build compiles the React frontend, installs the Python backend and copies
the frontend assets into the runtime image. FastAPI serves `/api/*` and the built single-page
application from one process on port `7860`.

Benefits:

- exactly one Space/container;
- no CORS complication between frontend and backend;
- same image runs locally and on Hugging Face;
- no Gradio-specific state model constraining the viewer;
- future deployment to another container platform requires no rewrite.

## 10. Observability

The application should expose at minimum:

- `/api/health` for liveness;
- structured server logs with request correlation ids;
- parser/validator version in exported reports;
- timing counters for parsing, validation and remote fetches (without storing document content).

Telemetry must remain opt-in if it leaves the runtime.
