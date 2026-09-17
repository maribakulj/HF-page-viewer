# ADR 0002: Normalize ALTO and PAGE into a loss-aware domain model

- Status: Accepted
- Date: 2026-09-17

## Context

ALTO and PAGE XML encode similar page concepts with different element structures, geometry
representations, metadata and reading-order models. Rendering each standard directly in the UI
would duplicate logic and make every new validation rule format-specific.

A naive common model, however, can destroy information that matters for provenance and
standards debugging.

## Decision

Each format adapter maps source XML into a common `PageDocument` model while preserving:

- source format and version;
- original XML ids;
- source paths/element names;
- unconsumed source attributes needed by the inspector;
- explicit geometry and measurement units;
- format-specific metadata in a namespaced extension field when no canonical field exists.

The viewer and general validation rules consume the normalized model. Normative checks that are
specific to ALTO or PAGE may still operate in format-specific rule modules.

## Consequences

- one renderer supports multiple standards;
- shared geometry and IIIF checks are implemented once;
- parser differences become testable adapter behavior;
- export can provide a stable normalized JSON representation;
- maintaining source references is mandatory and slightly increases model size.

The last point is intentional: a validator that cannot tell the user which XML element caused a
problem is merely generating administrative weather reports.
