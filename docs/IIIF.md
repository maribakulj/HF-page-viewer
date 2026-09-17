# Browser-side IIIF inspection

HF Page Viewer treats IIIF as a provider-neutral browser source and validation context. The local image + ALTO/PAGE workflow remains independent and fully offline; IIIF network access happens only after the user provides a public HTTP(S) URL.

## Supported resources

The browser adapter currently normalizes:

- IIIF Image API 2.x `info.json`;
- IIIF Image API 3.x `info.json`;
- IIIF Presentation API 2.1 Manifests;
- IIIF Presentation API 3.x Manifests.

Version-specific JSON-LD structure is kept inside `iiifModel.ts`:

- Presentation 3 painting images are discovered through `Manifest.items → Canvas.items → AnnotationPage.items → Annotation[motivation=painting].body`;
- Presentation 2 painting images are discovered through `sequences[].canvases[].images[].resource`;
- Image API 2 and 3 services normalize to the same `IiifImageService` model.

The application does not contain a Gallica-specific parser. Provider convenience adapters may be added later only on top of this generic layer.

## Image-service requests and native tiled viewing

Normalized services expose:

- service base ID;
- API version;
- profile when encoded;
- width/height when known;
- canonical `info.json` URL;
- canonical full-image request.

The canonical full-image request policy is:

- Image API 3: `full/max/0/default.jpg`;
- Image API 2: `full/full/0/default.jpg`.

`ImageInfo` also carries a normalized `tile_source_url` when an Image API service exists. `PageViewer` now passes that `info.json` directly to OpenSeadragon as the preferred TileSource. When no usable Image API service is available, the viewer falls back to the normalized raster URL.

Renderer failures are separated from metadata-fetch failures:

- `IIIF.TILE_SOURCE_OPEN_FAILED` means OpenSeadragon could not open the normalized IIIF TileSource;
- `IIIF.TILE_LOAD_FAILED` means a terminal tile request failed after OpenSeadragon exhausted retries.

This distinction matters because a manifest or `info.json` can parse correctly while the actual image service is temporarily unavailable, misconfigured, or blocked independently.

## Browser fetch and security policy

`iiifFetch.ts` performs direct browser requests. There is no arbitrary-URL server proxy and no application credential forwarding.

Default controls:

- HTTP(S) only;
- `credentials: omit`;
- CORS mode for readable IIIF JSON;
- 12 second request timeout;
- 5 MiB metadata response limit;
- `Content-Length` pre-check when available;
- streaming byte limit when a readable response body is available;
- explicit JSON parse before IIIF semantic normalization.

Stable fetch/parse diagnostic codes include:

- `IIIF.URL_INVALID`;
- `IIIF.ABORTED`;
- `IIIF.TIMEOUT`;
- `IIIF.CORS_BLOCKED`;
- `IIIF.NETWORK_ERROR`;
- `IIIF.HTTP_ERROR`;
- `IIIF.RESPONSE_TOO_LARGE`;
- `IIIF.INVALID_JSON`;
- `IIIF.INVALID_STRUCTURE`;
- `IIIF.UNSUPPORTED_RESOURCE`.

### CORS classification

Browser `fetch()` commonly exposes both CORS denial and genuine transport failure as a `TypeError`. The adapter therefore does not equate a failed readable fetch with an invalid IIIF resource.

For a cross-origin `TypeError`, it performs one credential-free `no-cors` reachability probe:

- if the browser receives an opaque response, the viewer reports `IIIF.CORS_BLOCKED`: the resource appears reachable but the browser is not allowed to read its response;
- if the opaque probe also fails, the viewer reports `IIIF.NETWORK_ERROR`, whose message explicitly leaves open network, DNS, TLS, mixed-content, extension and CORS-related transport causes.

An opaque probe cannot inspect status or content. `IIIF.CORS_BLOCKED` is therefore an interoperability/access diagnosis, never a statement that the remote IIIF JSON is valid or invalid.

## Canvas and painting-image selection

The normalized Manifest model preserves every painting-image candidate on each Canvas.

Selection policy:

- one painting image: it may be selected automatically;
- zero painting images: the UI reports that no normalized image is available;
- more than one painting image: no image is guessed. The user must choose explicitly.

This policy is surfaced both in the source UI and by `IIIF.MULTIPLE_IMAGE_CANDIDATES` when an XML page is being validated against an ambiguous Canvas.

If a Manifest references an Image API service but omits service dimensions, `useIiifSource.ts` inspects that service's `info.json` separately. Failure to inspect the service is reported separately from failure to parse the Manifest.

## XML ↔ IIIF validation

IIIF validation remains pure TypeScript and does not depend on React.

Implemented findings:

- `IIIF.CANVAS_DIMENSION_MISMATCH`;
- `IIIF.IMAGE_DIMENSION_MISMATCH`;
- `IIIF.MULTIPLE_IMAGE_CANDIDATES`.

Dimension comparisons run only when the XML page uses pixel coordinates:

- exact dimensions: no finding;
- different dimensions with the same aspect ratio: informational finding, because deterministic coordinate scaling is possible but should be verified;
- materially different aspect ratio: warning, because the selected Canvas/image may not correspond to the XML page or one source may encode incorrect dimensions.

The local raster alignment diagnostics and IIIF dimension diagnostics are intentionally separate. A user can therefore load local image + XML + IIIF together and compare all three sources without one silently replacing the evidence from another.

## Viewer-source policy

Local and IIIF images may coexist.

- loading a local image makes the local raster the default viewer source;
- if there is no local image and IIIF resolves to a usable image, IIIF becomes the viewer source automatically;
- when both exist, the user can explicitly switch the viewer to IIIF and back to the local raster;
- IIIF validation remains available regardless of which raster is currently displayed.

When the chosen IIIF candidate exposes Image API 2/3 metadata, the viewer uses native OpenSeadragon tiled rendering. Otherwise it renders the normalized raster URL.

## Reproducible live smoke tests

`.github/workflows/iiif-live-smoke.yml` runs the real browser application in system Chrome and records screenshots plus a JSON evidence artifact. It is intentionally separate from the core CI so third-party endpoint outages do not block unrelated ALTO/PAGE changes.

Validated live cases on 2026-09-17 in Chrome 152:

- IIIF Image API 3 reference service: loaded as `iiif_tiles`; multiple real JPEG tile responses returned HTTP 200;
- IIIF Image API 2.1 reference service: loaded as `iiif_tiles`; multiple real JPEG tile responses returned HTTP 200;
- IIIF Presentation 3 Cookbook manifest: normalized successfully and displayed its painting raster;
- BnF `openapi.bnf.fr` Image API v3 endpoint: normalized successfully and selected as `iiif_tiles`;
- Gallica Presentation 2 manifest: normalized successfully;
- historical Gallica image endpoint used in the smoke test advertises IIIF Image API **1.1** (`http://library.stanford.edu/iiif/image-api/1.1/context.json`), so `IIIF.UNSUPPORTED_RESOURCE` is the expected result for the current Image 2/3 scope rather than a parser failure.

The provider probes are observational. The generic IIIF reference cases remain the reproducible compatibility baseline.

## Tests

The browser suite covers:

- Image API 2/3 normalization;
- Presentation 2/3 normalization;
- painting-only extraction;
- multiple-candidate preservation;
- service-base URL inference;
- HTTP/JSON/size/timeout/network/CORS diagnostics;
- explicit viewer candidate selection;
- service-dimension enrichment;
- XML/Canvas/image dimension findings;
- pure TileSource selection for raster vs IIIF tiled images.

The live browser workflow additionally proves that OpenSeadragon opens real Image API 2/3 `info.json` documents and requests actual tiles.

## Remaining IIIF work

The generic IIIF browser path is now complete for the current #7 acceptance scope. Future improvements should be driven by real corpus needs rather than silently broadening the contract. Candidate follow-up work includes:

1. optional legacy IIIF Image API 1.1 support for historical providers such as old Gallica image endpoints;
2. stronger linkage checks between XML source-image references, Canvas IDs and Image service IDs where evidence is actually encoded;
3. additional Presentation 2 edge cases such as externally referenced sequences/canvases;
4. provider convenience adapters on top of, never inside, the generic normalization layer.
