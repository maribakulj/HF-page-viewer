# ADR 0001: Application stack

- Status: Accepted
- Date: 2026-09-17

## Context

The application needs a high-performance pan/zoom page viewer with thousands of interactive
geometry objects, XML parsing/validation, IIIF network integration, and simple deployment to a
Hugging Face Space. Gradio is excellent for model demos but would make the central viewer and
selection state unnecessarily awkward.

## Decision

Use:

- FastAPI/Python for API, XML/IIIF processing and validation;
- React + TypeScript for the web UI;
- OpenSeadragon for deep-zoom/page navigation;
- SVG overlays initially, with a canvas/WebGL fallback if very large newspapers require it;
- a multi-stage Docker image served on port `7860` for Hugging Face Spaces.

FastAPI serves both `/api/*` and the compiled frontend so production is same-origin.

## Consequences

Positive:

- standards logic remains natural to implement and test in Python;
- the viewer gets a mature browser interaction model;
- one container works on Spaces and ordinary container hosts;
- the project is not coupled to a notebook/demo framework.

Costs:

- two language toolchains;
- frontend dependency maintenance;
- a build step before production deployment.

These costs are accepted because the viewer is the product, not a decorative wrapper around a
single Python callback.
