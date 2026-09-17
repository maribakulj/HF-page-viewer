# ADR 0003: Use a browser-only Static Space runtime

- Status: accepted
- Date: 2026-09-17

## Context

The initial architecture used a React frontend served by FastAPI in a Docker Space. Hugging Face subsequently requires a paid account plan to create Docker or ordinary Gradio compute Spaces, while Static Spaces remain free and support frontend build commands.

The project requirement is to remain deployable without a subscription.

## Decision

The production application is a Hugging Face Static Space built with React/TypeScript/Vite.

All core inspection work required by the public application must run in the browser:

- local XML parsing and normalization;
- layout/geometry analysis;
- deterministic validation;
- browser-side XSD validation via WebAssembly where needed;
- IIIF requests directly from the browser when CORS permits.

Local files must not be uploaded to an application server.

## Consequences

Positive:

- zero Hugging Face subscription requirement;
- stronger privacy for local images and XML;
- no server lifecycle, SSRF surface or backend scaling burden;
- static CDN deployment and simple reproducibility.

Trade-offs:

- remote resources without CORS cannot be inspected directly;
- heavy schema validation must be kept efficient in WebAssembly/Web Workers;
- browser memory/performance limits matter for very large pages.

The Python backend is temporarily retained only as a reference oracle during migration and is not deployed.
