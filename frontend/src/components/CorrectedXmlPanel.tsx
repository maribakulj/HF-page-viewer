import type { CorrectedXmlState } from "../useCorrectedXmlExport";

function downloadXml(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CorrectedXmlPanel({ state }: { state: CorrectedXmlState }) {
  if (state.building) {
    return <section className="corrected-xml-panel"><h3>Corrected XML</h3><p>Building source-preserving export, SHA-256 and corrected-output XSD status…</p></section>;
  }

  if (state.error) {
    return <section className="corrected-xml-panel"><h3>Corrected XML</h3><p className="inline-error">{state.error}</p></section>;
  }

  if (!state.result || !state.filename) {
    return (
      <section className="corrected-xml-panel">
        <h3>Corrected XML</h3>
        <p>Apply a text or bbox edit to produce an auditable corrected XML export.</p>
      </section>
    );
  }

  const { result } = state;
  return (
    <section className="corrected-xml-panel">
      <div className="corrected-xml-heading">
        <div>
          <h3>Corrected XML</h3>
          <p>{result.applied_word_text_edits + result.applied_bbox_edits} applied · {result.skipped_edits} skipped</p>
        </div>
        <button type="button" onClick={() => downloadXml(result.xml, state.filename!)}>Download XML</button>
      </div>
      <div className="corrected-xsd-status">
        {state.xsdValidation.status === "valid" && <span className="status status-ok">Corrected XSD valid</span>}
        {state.xsdValidation.status === "invalid" && <span className="status status-error">Corrected XSD invalid</span>}
        {state.xsdValidation.status === "unsupported" && <span className="status status-neutral">Corrected XSD not pinned</span>}
        {state.xsdValidation.status === "error" && <span className="status status-error">Corrected XSD validator error</span>}
      </div>
      {state.fingerprint && (
        <dl className="compact-dl">
          <div><dt>SHA-256</dt><dd className="hash-value">{state.fingerprint.hex}</dd></div>
          <div><dt>Bytes</dt><dd>{state.fingerprint.bytes.toLocaleString()}</dd></div>
        </dl>
      )}
      {state.xsdValidation.status === "invalid" && (
        <details>
          <summary>{state.xsdValidation.diagnostics.length} corrected-XSD diagnostic{state.xsdValidation.diagnostics.length === 1 ? "" : "s"}</summary>
          <ul className="corrected-xml-warnings">
            {state.xsdValidation.diagnostics.map((diagnostic, index) => <li key={index}>{diagnostic.message}</li>)}
          </ul>
        </details>
      )}
      {state.xsdValidation.status === "unsupported" && <p className="muted">{state.xsdValidation.reason}</p>}
      {state.xsdValidation.status === "error" && <p className="inline-error">{state.xsdValidation.message}</p>}
      <p className="muted">Source-preserving DOM patch. Unedited elements are preserved structurally, but output is not byte-identical to the original XML.</p>
      {result.warnings.length > 0 && (
        <details>
          <summary>{result.warnings.length} export warning{result.warnings.length === 1 ? "" : "s"}</summary>
          <ul className="corrected-xml-warnings">
            {result.warnings.map((warning, index) => <li key={`${warning.code}:${index}`}><strong>{warning.code}</strong> · {warning.message}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
