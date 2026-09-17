import { qcReportFilename } from "../qcReport";
import type { QcReport } from "../qcReport";

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
        <p className="muted">Report v{report.report_version} · validator {report.validation.validator_version} · {report.validation.summary.total} findings</p>
      )}
      {fingerprintError && <p className="inline-error">Fingerprint warning: {fingerprintError}</p>}
    </section>
  );
}
