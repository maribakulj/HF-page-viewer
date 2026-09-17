import { useState } from "react";

import { formatGeometry } from "../pageModel";
import type { AlignmentStatus, PageCounts } from "../pageModel";
import type {
  ImageInfo,
  OverlayNode,
  PageDocumentDTO,
  PageDTO,
  RegionDTO,
  TextLineDTO,
  WordDTO,
} from "../types";

type InspectorTab = "overview" | "structure" | "metadata";

type TreeNode = {
  key: string;
  id: string;
  label: string;
  children: TreeNode[];
};

function regionTree(region: RegionDTO): TreeNode {
  return {
    key: `region:${region.source_ref?.path ?? region.element_id}`,
    id: region.element_id,
    label: `${region.region_type} · ${region.element_id}`,
    children: [
      ...region.regions.map(regionTree),
      ...region.lines.map(lineTree),
    ],
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

function TreeBranch({
  node,
  selectedKey,
  onSelect,
}: {
  node: TreeNode;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <li className="tree-item">
      <div className="tree-row">
        {hasChildren ? (
          <button
            type="button"
            className="tree-expander"
            onClick={() => setExpanded((value) => !value)}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${node.label}`}
            aria-expanded={expanded}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="tree-spacer" />
        )}
        <button
          type="button"
          className={`tree-node-button ${selectedKey === node.key ? "is-selected" : ""}`}
          onClick={() => onSelect(node.key)}
        >
          {node.label}
        </button>
      </div>
      {expanded && hasChildren && (
        <ul className="tree-list tree-list-nested">
          {node.children.map((child) => (
            <TreeBranch key={child.key} node={child} selectedKey={selectedKey} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

function SelectionCard({ selected }: { selected: OverlayNode | null }) {
  if (!selected) {
    return <p className="muted">Click an overlay or structure node to inspect its source data.</p>;
  }
  return (
    <div className="selection-card">
      <div className="selection-heading">
        <span className={`kind-chip kind-${selected.kind}`}>{selected.kind}</span>
        <strong>{selected.elementId}</strong>
      </div>
      {selected.text && <p className="selection-text">{selected.text}</p>}
      <dl className="compact-dl">
        <div><dt>Geometry</dt><dd>{formatGeometry(selected.geometry)}</dd></div>
        <div><dt>Confidence</dt><dd>{selected.confidence == null ? "—" : `${(selected.confidence * 100).toFixed(1)}%`}</dd></div>
        <div><dt>Source</dt><dd>{selected.sourceRef?.path ?? "—"}</dd></div>
      </dl>
      {selected.sourceRef && Object.keys(selected.sourceRef.attributes).length > 0 && (
        <details className="source-attributes">
          <summary>Source XML attributes</summary>
          <dl className="attribute-list">
            {Object.entries(selected.sourceRef.attributes).map(([name, value]) => (
              <div key={name}><dt>{name}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

export function Inspector({
  document,
  page,
  image,
  counts,
  selected,
  selectedKey,
  alignment,
  onSelect,
}: {
  document: PageDocumentDTO | null;
  page: PageDTO | null;
  image: ImageInfo | null;
  counts: PageCounts | null;
  selected: OverlayNode | null;
  selectedKey: string | null;
  alignment: AlignmentStatus;
  onSelect: (key: string) => void;
}) {
  const [tab, setTab] = useState<InspectorTab>("overview");
  const tree = page?.regions.map(regionTree) ?? [];

  return (
    <aside className="panel inspector-panel">
      <section className="selection-section">
        <h2>Selection</h2>
        <SelectionCard selected={selected} />
      </section>

      <nav className="tabs" aria-label="Inspector sections">
        {(["overview", "structure", "metadata"] as InspectorTab[]).map((item) => (
          <button
            type="button"
            key={item}
            className={tab === item ? "is-active" : ""}
            onClick={() => setTab(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>

      <div className="tab-content">
        {tab === "overview" && (
          <>
            <dl className="compact-dl">
              <div><dt>Format</dt><dd>{document ? `${document.source_format} ${document.source_version ?? "?"}` : "—"}</dd></div>
              <div><dt>Unit</dt><dd>{page?.measurement_unit ?? "—"}</dd></div>
              <div><dt>ALTO page</dt><dd>{page?.width && page.height ? `${page.width} × ${page.height}` : "—"}</dd></div>
              <div><dt>Image</dt><dd>{image ? `${image.width} × ${image.height}` : "—"}</dd></div>
              <div><dt>Language</dt><dd>{page?.language ?? "—"}</dd></div>
              <div><dt>Rotation</dt><dd>{page?.rotation == null ? "—" : `${page.rotation}°`}</dd></div>
            </dl>
            <div className={`alignment-callout alignment-${alignment.kind}`}>{alignment.message}</div>
            {counts && (
              <div className="count-grid">
                <div><strong>{counts.regions.toLocaleString()}</strong><span>regions</span></div>
                <div><strong>{counts.lines.toLocaleString()}</strong><span>lines</span></div>
                <div><strong>{counts.words.toLocaleString()}</strong><span>words</span></div>
                <div><strong>{counts.glyphs.toLocaleString()}</strong><span>glyphs</span></div>
              </div>
            )}
            {document && document.notices.length > 0 && (
              <section className="notice-list">
                <h3>Parser notices</h3>
                {document.notices.map((notice, index) => (
                  <article key={`${notice.code}:${notice.source_ref?.path ?? index}`}>
                    <strong>{notice.code}</strong>
                    <p>{notice.message}</p>
                  </article>
                ))}
              </section>
            )}
          </>
        )}

        {tab === "structure" && (
          tree.length ? (
            <ul className="tree-list">
              {tree.map((node) => (
                <TreeBranch key={node.key} node={node} selectedKey={selectedKey} onSelect={onSelect} />
              ))}
            </ul>
          ) : <p className="muted">No parsed structure yet.</p>
        )}

        {tab === "metadata" && (
          document ? (
            <div className="metadata-stack">
              <section>
                <h3>Source metadata</h3>
                <dl className="attribute-list">
                  {document.metadata.map((entry, index) => (
                    <div key={`${entry.label}:${index}`}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>
                  ))}
                </dl>
              </section>
              <section>
                <h3>Processing</h3>
                {document.processing_steps.length ? document.processing_steps.map((step, index) => (
                  <article className="metadata-card" key={step.identifier ?? index}>
                    <strong>{step.software_name ?? "Unnamed processing step"}</strong>
                    <p>{[step.software_version, step.timestamp].filter(Boolean).join(" · ") || "No version/date"}</p>
                  </article>
                )) : <p className="muted">No processing history encoded.</p>}
              </section>
              <section>
                <h3>Styles & tags</h3>
                {document.extensions.length ? document.extensions.map((extension, index) => (
                  <article className="metadata-card" key={`${extension.category}:${extension.identifier ?? index}`}>
                    <strong>{extension.category} · {extension.name}</strong>
                    <p>{extension.identifier ?? "No ID"}</p>
                  </article>
                )) : <p className="muted">No style/tag declarations encoded.</p>}
              </section>
            </div>
          ) : <p className="muted">Load ALTO XML to inspect metadata.</p>
        )}
      </div>
    </aside>
  );
}
