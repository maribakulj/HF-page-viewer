import { useState } from "react";

import { formatGeometry } from "../pageModel";
import type { AlignmentStatus, PageCounts } from "../pageModel";
import type { ImageInfo, OverlayNode, PageDocumentDTO, PageDTO, RegionDTO, TextLineDTO, WordDTO } from "../types";
import type { ValidationFinding, ValidationReport } from "../validation";
import type { BrowserXsdValidation } from "../xsdValidationProtocol";

type InspectorTab = "overview" | "structure" | "validation" | "metadata";
type TreeNode = { key: string; id: string; label: string; children: TreeNode[] };

function regionTree(region: RegionDTO): TreeNode {
  return {
    key: `region:${region.source_ref?.path ?? region.element_id}`,
    id: region.element_id,
    label: `${region.region_type} · ${region.element_id}`,
    children: [...region.regions.map(regionTree), ...region.lines.map(lineTree)],
  };
}

function lineTree(line: TextLineDTO): TreeNode {
  const text = line.text_alternatives[0]?.text;
  return {
    key: `line:${line.source_ref?.path ?? line.element_id}`,
    id: line.element_id,
    label: `line · ${line.element_id}${text ? ` · ${text.slice(0, 34)}` : ""}`,
    children: line.words.map(wordTree),
  };
}

function wordTree(word: WordDTO): TreeNode {
  const text = word.text_alternatives[0]?.text;
  return {
    key: `word:${word.source_ref?.path ?? word.element_id}`,
    id: word.element_id,
    label: `word · ${word.element_id}${text ? ` · ${text}` : ""}`,
    children: word.glyphs.map((glyph) => ({
      key: `glyph:${glyph.source_ref?.path ?? glyph.element_id}`,
      id: glyph.element_id,
      label: `glyph · ${glyph.element_id}${glyph.text_alternatives[0]?.text ? ` · ${glyph.text_alternatives[0].text}` : ""}`,
      children: [],
    })),
  };
}

function TreeBranch({ node, selectedKey, onSelect }: { node: TreeNode; selectedKey: string | null; onSelect: (key: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  return (
    <li className="tree-item">
      <div className="tree-row">
        {hasChildren ? (
          <button type="button" className="tree-expander" onClick={() => setExpanded((value) => !value)} aria-label={`${expanded ? "Collapse" : "Expand"} ${node.label}`} aria-expanded={expanded}>{expanded ? "▾" : "▸"}</button>
        ) : <span className="tree-spacer" />}
        <button type="button" className={`tree-node-button ${selectedKey === node.key ? "is-selected" : ""}`} onClick={() => onSelect(node.key)}>{node.label}</button>
      </div>
      {expanded && hasChildren && <ul className="tree-list tree-list-nested">{node.children.map((child) => <TreeBranch key={child.key} node={child} selectedKey={selectedKey} onSelect={onSelect} />)}</ul>}
    </li>
  );
}

function SelectionCard({ selected }: { selected: OverlayNode | null }) {
  if (!selected) return <p className="muted">Click an overlay, structure node, or validation finding to inspect its source data.</p>;
  return (
    <div className="selection-card">
      <div className="selection-heading"><span className={`kind-chip kind-${selected.kind}`}>{selected.kind}</span><strong>{selected.elementId}</strong></div>
      {selected.text && <p className="selection-text">{selected.text}</p>}
      <dl className="compact-dl">
        <div><dt>Geometry</dt><dd>{formatGeometry(selected.geometry)}</dd></div>
        <div><dt>Confidence</dt><dd>{selected.confidence == null ? "—" : `${(selected.confidence * 100).toFixed(1)}%`}</dd></div>
        <div><dt>Source</dt><dd>{selected.sourceRef?.path ?? "—"}</dd></div>
      </dl>
      {selected.sourceRef && Object.keys(selected.sourceRef.attributes).length > 0 && (
        <details className="source-attributes"><summary>Source XML attributes</summary><dl className="attribute-list">{Object.entries(selected.sourceRef.attributes).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl></details>
      )}
    </div>
  );
}

function downloadValidationReport(report: ValidationReport): void {
  const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `hf-page-viewer-validation-${report.source_format}-${report.source_version ?? "unknown"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function FindingCard({ finding, onSelect }: { finding: ValidationFinding; onSelect: (finding: ValidationFinding) => void }) {
  const navigable = finding.target.page_index != null || finding.target.node_key != null;
  return (
    <article className={`validation-finding validation-${finding.severity}`}>
      <div className="validation-finding-heading">
        <span className={`severity-chip severity-${finding.severity}`}>{finding.severity}</span>
        <strong>{finding.rule_id}</strong>
      </div>
      <p>{finding.message}</p>
      <dl className="compact-dl validation-location">
        <div><dt>Page</dt><dd>{finding.target.page_index == null ? "—" : finding.target.page_index + 1}</dd></div>
        <div><dt>Element</dt><dd>{finding.target.element_id ?? "—"}</dd></div>
        <div><dt>Source</dt><dd>{finding.target.source_path ?? "—"}</dd></div>
      </dl>
      {finding.remediation && <p className="validation-remediation">{finding.remediation}</p>}
      <div className="validation-actions">
        {navigable && <button type="button" onClick={() => onSelect(finding)}>Inspect target</button>}
        <details><summary>Evidence</summary><pre>{JSON.stringify(finding.evidence, null, 2)}</pre></details>
      </div>
    </article>
  );
}

function XsdStatusCard({ validation }: { validation: BrowserXsdValidation }) {
  if (validation.status === "idle") return null;
  if (validation.status === "validating") {
    return <div className="xsd-status xsd-validating"><strong>XSD · {validation.schemaLabel}</strong><p>Validating in a browser Worker…</p></div>;
  }
  if (validation.status === "unsupported") {
    return <div className="xsd-status xsd-unsupported"><strong>XSD not pinned for this version</strong><p>{validation.reason}</p></div>;
  }
  if (validation.status === "valid") {
    return <div className="xsd-status xsd-valid"><strong>XSD valid · {validation.schemaLabel}</strong><p>Normative schema validation completed locally with libxml2-wasm.</p></div>;
  }
  if (validation.status === "invalid") {
    return <div className="xsd-status xsd-invalid"><strong>XSD invalid · {validation.schemaLabel}</strong><p>{validation.diagnostics.length} schema diagnostic{validation.diagnostics.length === 1 ? "" : "s"}; each diagnostic is included below as XML.SCHEMA_INVALID.</p></div>;
  }
  return <div className="xsd-status xsd-error"><strong>XSD validator error · {validation.schemaLabel}</strong><p>{validation.stage}: {validation.message}</p></div>;
}

export function Inspector({
  document,
  page,
  image,
  counts,
  selected,
  selectedKey,
  alignment,
  validationReport,
  xsdValidation,
  onSelect,
  onValidationSelect,
}: {
  document: PageDocumentDTO | null;
  page: PageDTO | null;
  image: ImageInfo | null;
  counts: PageCounts | null;
  selected: OverlayNode | null;
  selectedKey: string | null;
  alignment: AlignmentStatus;
  validationReport: ValidationReport | null;
  xsdValidation: BrowserXsdValidation;
  onSelect: (key: string) => void;
  onValidationSelect: (finding: ValidationFinding) => void;
}) {
  const [tab, setTab] = useState<InspectorTab>("overview");
  const tree = page?.regions.map(regionTree) ?? [];
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "structure", label: "Structure" },
    { id: "validation", label: validationReport ? `Validation ${validationReport.summary.total}` : "Validation" },
    { id: "metadata", label: "Metadata" },
  ];

  return (
    <aside className="panel inspector-panel">
      <section className="selection-section"><h2>Selection</h2><SelectionCard selected={selected} /></section>
      <nav className="tabs" aria-label="Inspector sections">{tabs.map((item) => <button type="button" key={item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
      <div className="tab-content">
        {tab === "overview" && <>
          <dl className="compact-dl">
            <div><dt>Format</dt><dd>{document ? `${document.source_format === "alto" ? "ALTO" : "PAGE XML"} ${document.source_version ?? "?"}` : "—"}</dd></div>
            <div><dt>Unit</dt><dd>{page?.measurement_unit ?? "—"}</dd></div>
            <div><dt>XML page</dt><dd>{page?.width && page.height ? `${page.width} × ${page.height}` : "—"}</dd></div>
            <div><dt>Image</dt><dd>{image ? `${image.width} × ${image.height}` : "—"}</dd></div>
            <div><dt>Language</dt><dd>{page?.language ?? "—"}</dd></div>
            <div><dt>Rotation</dt><dd>{page?.rotation == null ? "—" : `${page.rotation}°`}</dd></div>
          </dl>
          <div className={`alignment-callout alignment-${alignment.kind}`}>{alignment.message}</div>
          {counts && <div className="count-grid"><div><strong>{counts.regions.toLocaleString()}</strong><span>regions</span></div><div><strong>{counts.lines.toLocaleString()}</strong><span>lines</span></div><div><strong>{counts.words.toLocaleString()}</strong><span>words</span></div><div><strong>{counts.glyphs.toLocaleString()}</strong><span>glyphs</span></div></div>}
          {validationReport && <div className="validation-mini-summary"><span className="severity-error">{validationReport.summary.errors} errors</span><span className="severity-warning">{validationReport.summary.warnings} warnings</span><span className="severity-info">{validationReport.summary.info} info</span></div>}
          {document && document.notices.length > 0 && <section className="notice-list"><h3>Parser notices</h3>{document.notices.map((notice, index) => <article key={`${notice.code}:${notice.source_ref?.path ?? index}`}><strong>{notice.code}</strong><p>{notice.message}</p></article>)}</section>}
        </>}

        {tab === "structure" && (tree.length ? <ul className="tree-list">{tree.map((node) => <TreeBranch key={node.key} node={node} selectedKey={selectedKey} onSelect={onSelect} />)}</ul> : <p className="muted">No parsed structure yet.</p>)}

        {tab === "validation" && (validationReport ? (
          <div className="validation-stack">
            <div className="validation-toolbar">
              <div><strong>Validator {validationReport.validator_version}</strong><p>{validationReport.summary.total} deterministic finding{validationReport.summary.total === 1 ? "" : "s"}</p></div>
              <button type="button" onClick={() => downloadValidationReport(validationReport)}>Export JSON</button>
            </div>
            <XsdStatusCard validation={xsdValidation} />
            <div className="validation-summary-grid">
              <div><strong>{validationReport.summary.errors}</strong><span>errors</span></div>
              <div><strong>{validationReport.summary.warnings}</strong><span>warnings</span></div>
              <div><strong>{validationReport.summary.info}</strong><span>info</span></div>
            </div>
            {validationReport.findings.length ? validationReport.findings.map((finding, index) => <FindingCard key={`${finding.rule_id}:${finding.target.source_path ?? finding.target.element_id ?? index}:${index}`} finding={finding} onSelect={onValidationSelect} />) : <p className="validation-clean">No deterministic findings from the currently implemented rules.</p>}
            <p className="muted validation-scope-note">Semantic rules run for every parsed document. Normative XSD currently runs only for the explicitly pinned ALTO 4.4 and PAGE XML 2019-07-15 schemas.</p>
          </div>
        ) : <p className="muted">Load ALTO or PAGE XML to run validation.</p>)}

        {tab === "metadata" && (document ? <div className="metadata-stack"><section><h3>Source metadata</h3><dl className="attribute-list">{document.metadata.map((entry, index) => <div key={`${entry.label}:${index}`}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>)}</dl></section><section><h3>Processing</h3>{document.processing_steps.length ? document.processing_steps.map((step, index) => <article className="metadata-card" key={step.identifier ?? index}><strong>{step.software_name ?? "Unnamed processing step"}</strong><p>{[step.software_version, step.timestamp].filter(Boolean).join(" · ") || "No version/date"}</p></article>) : <p className="muted">No processing history encoded.</p>}</section><section><h3>Styles, tags & extensions</h3>{document.extensions.length ? document.extensions.map((extension, index) => <article className="metadata-card" key={`${extension.category}:${extension.identifier ?? index}`}><strong>{extension.category} · {extension.name}</strong><p>{extension.identifier ?? extension.text ?? "No ID"}</p></article>) : <p className="muted">No extensions encoded.</p>}</section></div> : <p className="muted">Load ALTO or PAGE XML to inspect metadata.</p>)}
      </div>
    </aside>
  );
}
