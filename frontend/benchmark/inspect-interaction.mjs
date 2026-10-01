import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "benchmark-results/inspection");
const url = process.env.INSPECTION_URL || "http://127.0.0.1:4175";
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const xml = `<?xml version="1.0"?>
<alto xmlns="http://www.loc.gov/standards/alto/ns-v3#">
  <Description><MeasurementUnit>pixel</MeasurementUnit></Description>
  <Layout><Page ID="p1" WIDTH="1200" HEIGHT="1600"><PrintSpace HPOS="0" VPOS="0" WIDTH="1200" HEIGHT="1600">
    <TextBlock ID="b1" HPOS="120" VPOS="300" WIDTH="900" HEIGHT="180">
      <TextLine ID="l1" HPOS="160" VPOS="340" WIDTH="700" HEIGHT="60">
        <String ID="w1" CONTENT="Alpha" HPOS="180" VPOS="350" WIDTH="140" HEIGHT="40"/>
        <String ID="w2" CONTENT="Beta" HPOS="380" VPOS="350" WIDTH="140" HEIGHT="40"/>
      </TextLine>
    </TextBlock>
    <TextBlock ID="b2" HPOS="120" VPOS="650" WIDTH="900" HEIGHT="180">
      <TextLine ID="l2" HPOS="160" VPOS="680" WIDTH="700" HEIGHT="60">
        <String ID="w3" CONTENT="Gamma" HPOS="180" VPOS="690" WIDTH="140" HEIGHT="40"/>
      </TextLine>
    </TextBlock>
  </PrintSpace></Page></Layout>
</alto>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="white"/><g font-size="32"><text x="180" y="383">Alpha</text><text x="380" y="383">Beta</text><text x="180" y="723">Gamma</text></g></svg>`;
const results = [];
let server;
let browser;
let page;
let serverLog = "";

async function point(x, y) {
  return page.locator(".page-overlay").evaluate((element, p) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + p.x / 1200 * rect.width, y: rect.top + p.y / 1600 * rect.height };
  }, { x, y });
}
async function move(x, y) {
  const p = await point(x, y);
  await page.mouse.move(p.x, p.y);
  return p;
}
async function click(x, y, count = 1) {
  const p = await move(x, y);
  await page.mouse.click(p.x, p.y, { clickCount: count, delay: 50 });
}
async function label(selector) {
  return page.locator(selector).evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label")));
}
async function expectTarget(prefix, selected = false) {
  const selector = selected ? ".overlay-node.is-selected" : ".overlay-node.is-inspect-target";
  await page.waitForFunction(({ selector, prefix }) => [...document.querySelectorAll(selector)].some((el) => el.getAttribute("aria-label")?.startsWith(prefix)), { selector, prefix }, { timeout: 2000 }).catch(async () => {
    throw new Error(`Expected ${selector} ${prefix}; found ${JSON.stringify(await label(selector))}`);
  });
}
async function setup() {
  await page.goto(url);
  await page.locator('input[type="file"]').nth(0).setInputFiles({ name: "inspection.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
  await page.locator('input[type="file"]').nth(1).setInputFiles({ name: "inspection.xml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  await page.waitForFunction(() => {
    const overlay = document.querySelector(".page-overlay");
    return overlay && Number(overlay.getAttribute("data-render-relative-zoom")) > 0 && overlay.getBoundingClientRect().height > 0;
  });
  assert.equal(await page.locator(".page-overlay").getAttribute("data-render-lod"), "overview");
  await page.getByRole("button", { name: "Toggle overlap inspection mode" }).click();
}
async function scenario(name, run) {
  try {
    await setup();
    await run();
    results.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: "failed", error: String(error) });
    console.error(`FAIL ${name}: ${error}`);
    await page.screenshot({ path: resolve(output, `${results.length}-failure.png`), fullPage: true }).catch(() => {});
  }
}

try {
  await mkdir(output, { recursive: true });
  if (!process.env.INSPECTION_URL) {
    server = spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4175", "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", (chunk) => { serverLog += chunk; });
    server.stderr.on("data", (chunk) => { serverLog += chunk; });
  }
  for (let attempt = 0; ; attempt += 1) {
    const ready = await fetch(url).then((response) => response.ok).catch(() => false);
    if (ready) break;
    if (attempt >= 80) throw new Error(`Viewer did not start. ${serverLog}`);
    await delay(250);
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await scenario("hover follows individual words at overview zoom", async () => {
    await move(250, 370);
    await expectTarget("word w1");
    const fill = await page.locator(".is-inspect-target").first().evaluate((el) => getComputedStyle(el).fill);
    assert.notEqual(fill, "rgba(0, 0, 0, 0)");
    assert.notEqual(fill, "none");
    await move(450, 370);
    await expectTarget("word w2");
    assert.equal((await label(".is-selected.overlay-node")).length, 0, "Hover must not change the inspector selection");
  });
  await scenario("clicking another word or block never leaves selection stuck", async () => {
    await click(250, 370); await expectTarget("word w1", true);
    await click(450, 370); await expectTarget("word w2", true);
    await click(250, 710); await expectTarget("word w3", true);
    await click(250, 370); await expectTarget("word w1", true);
  });
  await scenario("repeated clicks cycle overlaps without a timing requirement", async () => {
    await click(250, 370); await expectTarget("word w1", true);
    await delay(600);
    await click(250, 370); await expectTarget("line l1", true);
    await delay(600);
    await click(250, 370); await expectTarget("region b1", true);
    await click(250, 370); await expectTarget("word w1", true);
  });
  await scenario("native double and triple clicks select broader elements", async () => {
    await click(250, 370, 2); await expectTarget("line l1", true);
    await click(250, 710, 3); await expectTarget("region b2", true);
  });
  await scenario("wheel zoom and dragging still work while inspecting", async () => {
    await click(250, 370);
    const before = await page.locator(".page-overlay").boundingBox();
    await move(600, 800); await page.mouse.wheel(0, -650);
    await page.waitForFunction((width) => document.querySelector(".page-overlay").getBoundingClientRect().width > width * 1.05, before.width, { timeout: 2500 });
    const afterZoom = await page.locator(".page-overlay").boundingBox();
    const selected = await label(".overlay-node.is-selected");
    const frame = await page.locator(".viewer-frame").boundingBox();
    const start = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(start.x + 80, start.y + 50, { steps: 10 }); await page.mouse.up();
    await delay(500);
    const afterDrag = await page.locator(".page-overlay").boundingBox();
    assert.ok(Math.abs(afterDrag.x - afterZoom.x) > 10 || Math.abs(afterDrag.y - afterZoom.y) > 10, "Drag must pan the image");
    assert.deepEqual(await label(".overlay-node.is-selected"), selected, "A pan is not a selection click");
  });
  await scenario("layer switches are respected by hit testing", async () => {
    await page.getByRole("checkbox", { name: "Words", exact: true }).uncheck();
    await move(250, 370); await expectTarget("line l1");
    await page.getByRole("checkbox", { name: "Words", exact: true }).check();
    await move(450, 370); await expectTarget("word w2");
  });
  await scenario("hover clears on leaving and Escape exits inspection", async () => {
    await move(250, 370); await expectTarget("word w1");
    await page.mouse.move(10, 10); await delay(100);
    assert.equal((await label(".is-inspect-target")).length, 0);
    await move(250, 370); await expectTarget("word w1");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("button", { name: "Toggle overlap inspection mode" }).getAttribute("aria-pressed"), "false");
    assert.equal((await label(".is-inspect-target")).length, 0);
  });
  assert.deepEqual(errors, [], "No uncaught browser exceptions");
  await writeFile(resolve(output, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.status === "failed")) process.exitCode = 1;
} finally {
  await writeFile(resolve(output, "vite.log"), serverLog).catch(() => {});
  await browser?.close();
  server?.kill();
}
