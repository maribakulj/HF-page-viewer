import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright-core";

const baseUrl = process.env.IIIF_SMOKE_URL ?? "http://127.0.0.1:4175/";
const executablePath = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const outputDir = resolve(process.cwd(), "iiif-smoke-results");

const requiredCases = [
  {
    id: "iiif-image-3-reference",
    input: "https://iiif.io/api/image/3.0/example/reference/0a469c27256eda739d43124cc448a3ba-1_frontcover/info.json",
    expectedVersion: "image-3",
    expectedViewerKind: "iiif_tiles",
    expectImageResponse: true,
  },
  {
    id: "iiif-image-2-reference",
    input: "https://iiif.io/api/image/2.1/example/reference/0a469c27256eda739d43124cc448a3ba-1_frontcover/info.json",
    expectedVersion: "image-2",
    expectedViewerKind: "iiif_tiles",
    expectImageResponse: true,
  },
  {
    id: "iiif-presentation-3-cookbook",
    input: "https://iiif.io/api/cookbook/recipe/0001-mvm-image/manifest.json",
    expectedVersion: "presentation-3",
    expectedViewerKind: "raster",
    expectImageResponse: true,
  },
];

const observationalCases = [
  {
    id: "gallica-image-2",
    input: "https://gallica.bnf.fr/iiif/ark:/12148/btv1b90017179/f15/info.json",
    inspectRaw: true,
  },
  {
    id: "bnf-openapi-image-3",
    input: "https://openapi.bnf.fr/iiif/image/v3/ark:/12148/bpt6k559839m/f1/info.json",
    inspectRaw: false,
  },
  {
    id: "gallica-presentation-2",
    input: "https://gallica.bnf.fr/iiif/ark:/12148/btv1b550076223/manifest.json",
    inspectRaw: true,
  },
  {
    id: "loc-presentation-2",
    input: "https://www.loc.gov/item/2017498721/manifest.json",
    inspectRaw: true,
  },
];

function serializableError(error) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack ?? null };
  return { name: "UnknownError", message: String(error), stack: null };
}

async function loadSource(page, input) {
  await page.getByLabel("IIIF URL").fill(input);
  await page.getByRole("button", { name: "Load IIIF" }).click();
}

async function firstDiagnostic(page) {
  return page.locator(".iiif-diagnostic strong").first().textContent().catch(() => null);
}

async function firstDiagnosticMessage(page) {
  return page.locator(".iiif-diagnostic span").first().textContent().catch(() => null);
}

async function waitForIiifOutcome(page, timeout = 25_000) {
  await page.waitForFunction(() => {
    const version = document.querySelector(".iiif-version-chip")?.textContent?.trim();
    const diagnostic = document.querySelector(".iiif-diagnostic strong")?.textContent?.trim();
    return Boolean(version || diagnostic);
  }, null, { timeout });
}

async function rawMetadataSummary(page, input) {
  return page.evaluate(async (url) => {
    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        headers: { Accept: "application/ld+json, application/json;q=0.9, */*;q=0.1" },
      });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        // Preserve the body prefix below when a provider returned non-JSON content.
      }
      const object = json && typeof json === "object" && !Array.isArray(json) ? json : null;
      return {
        status: response.status,
        ok: response.ok,
        finalUrl: response.url,
        contentType: response.headers.get("content-type"),
        keys: object ? Object.keys(object).slice(0, 30) : [],
        context: object?.["@context"] ?? null,
        id: object?.id ?? object?.["@id"] ?? null,
        type: object?.type ?? object?.["@type"] ?? null,
        protocol: object?.protocol ?? null,
        profile: object?.profile ?? null,
        width: object?.width ?? null,
        height: object?.height ?? null,
        bodyPrefix: text.slice(0, 500),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    }
  }, input);
}

async function runRequiredCase(browser, testCase) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const imageResponses = [];
  page.on("response", async (response) => {
    try {
      const contentType = (await response.headerValue("content-type")) ?? "";
      if (response.status() < 400 && contentType.toLowerCase().startsWith("image/")) {
        imageResponses.push({ url: response.url(), status: response.status(), contentType });
      }
    } catch {
      // A response disappearing during page teardown is irrelevant to the smoke result.
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await loadSource(page, testCase.input);
    await page.waitForFunction(
      (expectedVersion) => document.querySelector(".iiif-version-chip")?.textContent?.trim() === expectedVersion,
      testCase.expectedVersion,
      { timeout: 25_000 },
    );
    const viewer = page.locator(`.viewer-frame[data-viewer-source-kind="${testCase.expectedViewerKind}"]`);
    await viewer.waitFor({ state: "visible", timeout: 25_000 });

    if (testCase.expectImageResponse) {
      await page.waitForFunction(
        () => performance.getEntriesByType("resource").some((entry) => {
          const resource = entry;
          return resource.initiatorType === "img" || /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(resource.name);
        }),
        null,
        { timeout: 25_000 },
      ).catch(async () => {
        const started = Date.now();
        while (imageResponses.length === 0 && Date.now() - started < 10_000) {
          await page.waitForTimeout(200);
        }
        if (imageResponses.length === 0) throw new Error("No successful image/tile response was observed after the IIIF source opened.");
      });
    }

    await page.waitForTimeout(800);
    const viewerText = await viewer.textContent();
    if (viewerText?.includes("IIIF.TILE_SOURCE_OPEN_FAILED")) {
      throw new Error("Viewer reported IIIF.TILE_SOURCE_OPEN_FAILED.");
    }
    if (viewerText?.includes("IIIF.TILE_LOAD_FAILED")) {
      throw new Error("Viewer reported IIIF.TILE_LOAD_FAILED.");
    }

    const sourceKind = await viewer.getAttribute("data-viewer-source-kind");
    await page.screenshot({ path: resolve(outputDir, `${testCase.id}.png`), fullPage: true });
    return {
      id: testCase.id,
      required: true,
      status: "ok",
      input: testCase.input,
      version: testCase.expectedVersion,
      viewerSourceKind: sourceKind,
      imageResponses: imageResponses.slice(0, 8),
      diagnostic: await firstDiagnostic(page),
    };
  } catch (error) {
    await page.screenshot({ path: resolve(outputDir, `${testCase.id}-failure.png`), fullPage: true }).catch(() => undefined);
    return {
      id: testCase.id,
      required: true,
      status: "error",
      input: testCase.input,
      error: serializableError(error),
      diagnostic: await firstDiagnostic(page),
      diagnosticMessage: await firstDiagnosticMessage(page),
      imageResponses: imageResponses.slice(0, 8),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function runObservationalCase(browser, testCase) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const raw = testCase.inspectRaw ? await rawMetadataSummary(page, testCase.input) : null;
    await loadSource(page, testCase.input);
    await waitForIiifOutcome(page);
    const version = await page.locator(".iiif-version-chip").textContent().catch(() => null);
    const diagnostic = await firstDiagnostic(page);
    const diagnosticMessage = await firstDiagnosticMessage(page);
    const viewerKind = await page.locator(".viewer-frame").getAttribute("data-viewer-source-kind").catch(() => null);
    await page.screenshot({ path: resolve(outputDir, `${testCase.id}.png`), fullPage: true });
    return {
      id: testCase.id,
      required: false,
      status: version ? "loaded" : "diagnostic",
      input: testCase.input,
      version: version?.trim() ?? null,
      diagnostic,
      diagnosticMessage,
      viewerSourceKind: viewerKind,
      raw,
    };
  } catch (error) {
    await page.screenshot({ path: resolve(outputDir, `${testCase.id}-failure.png`), fullPage: true }).catch(() => undefined);
    return {
      id: testCase.id,
      required: false,
      status: "error",
      input: testCase.input,
      error: serializableError(error),
      diagnostic: await firstDiagnostic(page),
      diagnosticMessage: await firstDiagnosticMessage(page),
      raw: testCase.inspectRaw ? await rawMetadataSummary(page, testCase.input).catch((rawError) => ({ error: String(rawError) })) : null,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-dev-shm-usage"],
});

try {
  const results = [];
  for (const testCase of requiredCases) {
    console.log(`Required live IIIF smoke: ${testCase.id}`);
    const result = await runRequiredCase(browser, testCase);
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }
  for (const testCase of observationalCases) {
    console.log(`Observational provider probe: ${testCase.id}`);
    const result = await runObservationalCase(browser, testCase);
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    browser: await browser.version(),
    baseUrl,
    results,
  };
  await writeFile(resolve(outputDir, "iiif-live-smoke.json"), `${JSON.stringify(report, null, 2)}\n`);

  const failedRequired = results.filter((result) => result.required && result.status !== "ok");
  if (failedRequired.length) {
    throw new Error(`Required IIIF smoke cases failed: ${failedRequired.map((result) => result.id).join(", ")}`);
  }
} finally {
  await browser.close();
}
