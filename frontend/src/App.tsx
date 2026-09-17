import { useEffect, useState } from "react";

type Health = {
  status: string;
  application: string;
  version: string;
};

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) throw new Error("Health endpoint unavailable");
        return response.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Document layout inspection</p>
          <h1>HF Page Viewer</h1>
        </div>
        <span className={health ? "status status-ok" : "status"}>
          {health ? `API ${health.version}` : "API unavailable"}
        </span>
      </header>

      <section className="workspace" aria-label="Application bootstrap preview">
        <aside className="panel source-panel">
          <h2>Sources</h2>
          <p>Image, ALTO/PAGE XML and IIIF inputs will live here.</p>
          <button type="button" disabled>
            Load page files
          </button>
        </aside>

        <section className="viewer-placeholder">
          <div>
            <p className="eyebrow">Phase 0</p>
            <h2>Viewer foundation ready</h2>
            <p>
              The next slice adds secure XML parsing, the normalized page model and
              OpenSeadragon overlays.
            </p>
          </div>
        </section>

        <aside className="panel inspector-panel">
          <h2>Inspector</h2>
          <dl>
            <div>
              <dt>Format</dt>
              <dd>Not loaded</dd>
            </div>
            <div>
              <dt>Geometry</dt>
              <dd>Not loaded</dd>
            </div>
            <div>
              <dt>Validation</dt>
              <dd>Not run</dd>
            </div>
            <div>
              <dt>IIIF</dt>
              <dd>Not linked</dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
