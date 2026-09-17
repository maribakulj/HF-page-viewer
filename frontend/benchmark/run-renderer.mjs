import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright-core";

const baseUrl = process.env.BENCHMARK_URL ?? "http://127.0.0.1:4174/benchmark.html";
const executablePath = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const outputDir = resolve(process.cwd(), "benchmark-results");

const cases = [
  { id: "full-1k-words", count: 1_000, mode: "words", policy: "all", prepareZoomSteps: 0 },
  { id: "full-10k-words", count: 10_000, mode: "words", policy: "all", prepareZoomSteps: 0 },
  { id: "full-50k-geometry", count: 50_000, mode: "mixed", policy: "all", prepareZoomSteps: 0 },
  { id: "adaptive-50k-home", count: 50_000, mode: "mixed", policy: "adaptive", prepareZoomSteps: 0 },
  { id: "adaptive-50k-word-zoom", count: 50_000, mode: "mixed", policy: "adaptive", prepareZoomSteps: 3 },
];

function round(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

function frameSummary(intervals) {
  if (!intervals?.length) return { frames: 0, medianMs: null, p95Ms: null, maxMs: null, over33ms: 0, over50ms: 0 };
  return {
    frames: intervals.length,
    medianMs: round(percentile(intervals, 0.5)),
    p95Ms: round(percentile(intervals, 0.95)),
    maxMs: round(Math.max(...intervals)),
    over33ms: intervals.filter((value) => value > 33.3).length,
    over50ms: intervals.filter((value) => value > 50).length,
  };
}

async function installLongTaskProbe(page) {
  await page.addInitScript(() => {
    window.__HF_LONG_TASKS__ = [];
    if (!("PerformanceObserver" in window)) return;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__HF_LONG_TASKS__.push({ startTime: entry.startTime, duration: entry.duration });
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      // Long Task API is optional. The benchmark still records the other metrics.
    }
  });
}

async function measureSelection(page) {
  return page.evaluate(async () => {
    const nodes = Array.from(document.querySelectorAll(".overlay-node"));
    const target = nodes[nodes.length - 1];
    if (!target) throw new Error("No overlay node available for selection benchmark.");

    return new Promise((resolve, reject) => {
      const startedAt = performance.now();
      const timeout = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error("Selection class did not update within 30 seconds."));
      }, 30_000);
      const finish = () => {
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve(performance.now() - startedAt);
      };
      const observer = new MutationObserver(() => {
        if (target.classList.contains("is-selected")) finish();
      });
      observer.observe(target, { attributes: true, attributeFilter: ["class"] });
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      if (target.classList.contains("is-selected")) finish();
    });
  });
}

async function clickZoom(page) {
  await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="Zoom in"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error("Zoom-in button is unavailable.");
    button.click();
  });
}

async function prepareZoom(page, steps) {
  for (let index = 0; index < steps; index += 1) {
    await clickZoom(page);
    await page.waitForTimeout(520);
  }
  if (steps > 0) await page.waitForTimeout(120);
}

async function measureZoomFrames(page) {
  const intervals = await page.evaluate(async () => {
    const button = document.querySelector('button[aria-label="Zoom in"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error("Zoom-in button is unavailable.");

    return new Promise((resolve) => {
      const values = [];
      const startedAt = performance.now();
      let previous = null;
      const frame = (now) => {
        if (previous != null) values.push(now - previous);
        previous = now;
        if (now - startedAt >= 700) {
          resolve(values);
          return;
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      button.click();
    });
  });
  return frameSummary(intervals);
}

async function measureHideAll(page) {
  return page.evaluate(async () => {
    const button = document.querySelector("[data-benchmark-hide-all]");
    const overlay = document.querySelector(".page-overlay");
    if (!(button instanceof HTMLButtonElement) || !overlay) throw new Error("Benchmark hide-all control is unavailable.");

    const expectedRemaining = document.querySelectorAll(".overlay-node.is-selected, .overlay-node.is-search-match, .overlay-node.is-search-active").length;
    const currentCount = () => document.querySelectorAll(".overlay-node").length;

    return new Promise((resolve, reject) => {
      const startedAt = performance.now();
      const timeout = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Layer hide did not settle at ${expectedRemaining} forced overlay node(s) within 30 seconds; ${currentCount()} remain.`));
      }, 30_000);
      const finish = () => {
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve(performance.now() - startedAt);
      };
      const observer = new MutationObserver(() => {
        if (currentCount() === expectedRemaining) finish();
      });
      observer.observe(overlay, { childList: true, subtree: true });
      button.click();
      if (currentCount() === expectedRemaining) finish();
    });
  });
}

async function browserSnapshot(page) {
  return page.evaluate(() => ({
    benchmark: window.__HF_PAGE_VIEWER_BENCHMARK__,
    overlayShapes: document.querySelectorAll(".overlay-node").length,
    lod: document.querySelector(".page-overlay")?.getAttribute("data-render-lod") ?? null,
    domNodes: document.getElementsByTagName("*").length,
    heapBytes: performance.memory?.usedJSHeapSize ?? null,
    longTasks: window.__HF_LONG_TASKS__ ?? [],
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
  }));
}

async function measureCase(browser, benchmarkCase) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await installLongTaskProbe(page);
  const url = new URL(baseUrl);
  url.searchParams.set("case", benchmarkCase.id);
  url.searchParams.set("count", String(benchmarkCase.count));
  url.searchParams.set("mode", benchmarkCase.mode);
  url.searchParams.set("policy", benchmarkCase.policy);

  try {
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction(
      () => window.__HF_PAGE_VIEWER_BENCHMARK__?.ready === true,
      null,
      { timeout: 120_000 },
    );

    const initial = await browserSnapshot(page);
    await prepareZoom(page, benchmarkCase.prepareZoomSteps);
    const prepared = await browserSnapshot(page);

    const selectionMs = await measureSelection(page);
    const zoom = await measureZoomFrames(page);
    const beforeHideLongTaskCount = await page.evaluate(() => window.__HF_LONG_TASKS__?.length ?? 0);
    const hideAllMs = await measureHideAll(page);
    const final = await page.evaluate(() => ({
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
      longTasks: window.__HF_LONG_TASKS__ ?? [],
      remainingOverlayNodes: document.querySelectorAll(".overlay-node").length,
    }));

    const initialLongTasks = initial.longTasks;
    const totalLongTasks = final.longTasks;
    return {
      id: benchmarkCase.id,
      count: benchmarkCase.count,
      mode: benchmarkCase.mode,
      policy: benchmarkCase.policy,
      prepareZoomSteps: benchmarkCase.prepareZoomSteps,
      status: "ok",
      generationMs: round(initial.benchmark?.generationMs),
      initialRenderMs: round(initial.benchmark?.initialRenderMs),
      initialOverlayShapes: initial.overlayShapes,
      initialLod: initial.lod,
      preparedOverlayShapes: prepared.overlayShapes,
      preparedLod: prepared.lod,
      domNodesPrepared: prepared.domNodes,
      initialLongTasks: initialLongTasks.length,
      initialLongTaskTotalMs: round(initialLongTasks.reduce((sum, task) => sum + task.duration, 0)),
      selectionMs: round(selectionMs),
      zoom,
      hideAllMs: round(hideAllMs),
      interactionLongTasks: Math.max(0, totalLongTasks.length - beforeHideLongTaskCount),
      totalLongTasks: totalLongTasks.length,
      totalLongTaskMs: round(totalLongTasks.reduce((sum, task) => sum + task.duration, 0)),
      heapInitialMb: initial.heapBytes == null ? null : round(initial.heapBytes / 1024 / 1024),
      heapPreparedMb: prepared.heapBytes == null ? null : round(prepared.heapBytes / 1024 / 1024),
      heapAfterHideMb: final.heapBytes == null ? null : round(final.heapBytes / 1024 / 1024),
      remainingOverlayNodes: final.remainingOverlayNodes,
      environment: {
        userAgent: initial.userAgent,
        hardwareConcurrency: initial.hardwareConcurrency,
      },
    };
  } catch (error) {
    return {
      id: benchmarkCase.id,
      count: benchmarkCase.count,
      mode: benchmarkCase.mode,
      policy: benchmarkCase.policy,
      prepareZoomSteps: benchmarkCase.prepareZoomSteps,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

function markdown(results, environment) {
  const rows = results.map((result) => {
    if (result.status !== "ok") {
      return `| ${result.id} | ${result.count.toLocaleString()} | ${result.policy} | ERROR | — | — | — | — | — | ${result.error.replaceAll("|", "\\|")} |`;
    }
    return `| ${result.id} | ${result.count.toLocaleString()} | ${result.policy} | ${result.initialOverlayShapes.toLocaleString()} → ${result.preparedOverlayShapes.toLocaleString()} | ${result.preparedLod ?? "—"} | ${result.initialRenderMs} | ${result.selectionMs} | ${result.zoom.p95Ms} | ${result.hideAllMs} | ${result.heapPreparedMb ?? "n/a"} |`;
  });
  return `# SVG overlay renderer benchmark\n\nGenerated by the reproducible Chrome-headless benchmark harness. These numbers are environment-specific baselines, not universal UX thresholds.\n\n- Chrome: ${environment.chromeVersion}\n- OS runner: ${environment.platform}\n- Node: ${process.version}\n- Benchmark URL: ${baseUrl}\n\n| case | source shapes | policy | live shapes initial → prepared | prepared LOD | initial render ms | selection ms | zoom p95 frame ms | hide-layers ms | prepared heap MB |\n| --- | ---: | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |\n${rows.join("\n")}\n`;
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-dev-shm-usage", "--enable-precise-memory-info"],
});

try {
  const environment = {
    chromeVersion: await browser.version(),
    platform: process.platform,
    executablePath,
  };
  const results = [];
  for (const benchmarkCase of cases) {
    console.log(`Running renderer benchmark: ${benchmarkCase.id} (${benchmarkCase.count.toLocaleString()} source shapes, ${benchmarkCase.policy})`);
    const result = await measureCase(browser, benchmarkCase);
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    environment,
    cases: results,
  };
  await writeFile(resolve(outputDir, "renderer.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(resolve(outputDir, "renderer.md"), markdown(results, environment));
  console.log(`Benchmark reports written to ${outputDir}`);
} finally {
  await browser.close();
}
