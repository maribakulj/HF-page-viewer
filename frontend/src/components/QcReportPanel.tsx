import { qcReportFilename } from "../qcReport";
import type { QcReport } from "../qcReport";

function formatDelta(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function downloadReport(report: QcReport): void {
  const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = qcReportFilename(report);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function QcReportPanel({
  report,
  hashing,
  fingerprintError,
}: {
  report: QcReport | null;
  hashing: boolean;
  fingerprintError: string | null;
}) {
  return (
    <section className="qc-report-panel" aria-label="Quality-control report">
      <div>
        <h3>QC report</h3>
        <p>Machine-readable validation evidence with local SHA-256 source fingerprints.</p>
      </div>
      <button type="button" className="source-image-switch" disabled={!report || hashing} onClick={() => report && downloadReport(report)}>
        {hashing ? "Hashing sources…" : "Export QC JSON"}
      </button>
      {report && !hashing && (
        <>
          <p className="muted">Report v{report.report_version} · validator {report.validation.validator_version} · {report.validation.summary.total} findings</p>
          {report.working_copy.modified && report.validation_comparison && (
            <div className="qc-delta-grid" aria-label="Validation before and after corrections">
              <div><span>Errors</span><strong>{report.validation_comparison.before.errors} → {report.validation_comparison.after.errors}</strong><small>{formatDelta(report.validation_comparison.delta.errors)}</small></div>
              <div><span>Warnings</span><strong>{report.validation_comparison.before.warnings} → {report.validation_comparison.after.warnings}</strong><small>{formatDelta(report.validation_comparison.delta.warnings)}</small></div>
              <div><span>Info</span><strong>{report.validation_comparison.before.info} → {report.validation_comparison.after.info}</strong><small>{formatDelta(report.validation_comparison.delta.info)}</small></div>
            </div>
          )}
        </>
      )}
      {fingerprintError && <p className="inline-error">Fingerprint warning: {fingerprintError}</p>}
    </section>
  );
}
