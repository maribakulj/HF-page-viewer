import { IiifParseError, inferIiifInputUrl, parseIiifJson } from "./iiifModel";
import type { IiifInspection } from "./iiifModel";

export type IiifFetchCode =
  | "IIIF.URL_INVALID"
  | "IIIF.ABORTED"
  | "IIIF.TIMEOUT"
  | "IIIF.CORS_BLOCKED"
  | "IIIF.NETWORK_ERROR"
  | "IIIF.HTTP_ERROR"
  | "IIIF.RESPONSE_TOO_LARGE"
  | "IIIF.INVALID_JSON"
  | "IIIF.INVALID_STRUCTURE"
  | "IIIF.UNSUPPORTED_RESOURCE";

export class IiifFetchError extends Error {
  readonly code: IiifFetchCode;
  readonly url: string | null;
  readonly status: number | null;

  constructor(code: IiifFetchCode, message: string, options: { url?: string | null; status?: number | null; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "IiifFetchError";
    this.code = code;
    this.url = options.url ?? null;
    this.status = options.status ?? null;
  }
}

export type IiifFetchOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  pageUrl?: string | null;
};

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

function normalizeHttpUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new IiifFetchError("IIIF.URL_INVALID", "IIIF source must be an absolute HTTP(S) URL.", { cause: error });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new IiifFetchError("IIIF.URL_INVALID", "IIIF source must use HTTP or HTTPS.", { url: url.toString() });
  }
  return url.toString();
}

function browserPageUrl(explicit: string | null | undefined): string | null {
  if (explicit !== undefined) return explicit;
  if (typeof window !== "undefined" && window.location?.href) return window.location.href;
  return null;
}

function isCrossOrigin(targetUrl: string, pageUrl: string | null): boolean {
  if (!pageUrl) return false;
  try {
    return new URL(targetUrl).origin !== new URL(pageUrl).origin;
  } catch {
    return false;
  }
}

function positiveIntegerHeader(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function boundedResponseText(response: Response, maxBytes: number, url: string): Promise<string> {
  const advertisedBytes = positiveIntegerHeader(response.headers.get("content-length"));
  if (advertisedBytes != null && advertisedBytes > maxBytes) {
    throw new IiifFetchError(
      "IIIF.RESPONSE_TOO_LARGE",
      `IIIF response advertises ${advertisedBytes.toLocaleString()} bytes, above the ${maxBytes.toLocaleString()} byte browser limit.`,
      { url, status: response.status },
    );
  }

  if (!response.body) {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > maxBytes) {
      throw new IiifFetchError(
        "IIIF.RESPONSE_TOO_LARGE",
        `IIIF response is ${bytes.toLocaleString()} bytes, above the ${maxBytes.toLocaleString()} byte browser limit.`,
        { url, status: response.status },
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel("IIIF response exceeded browser size limit").catch(() => undefined);
        throw new IiifFetchError(
          "IIIF.RESPONSE_TOO_LARGE",
          `IIIF response exceeded the ${maxBytes.toLocaleString()} byte browser limit while streaming.`,
          { url, status: response.status },
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function noCorsReachabilityProbe(fetchImpl: typeof fetch, url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      mode: "no-cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "follow",
      signal,
    });
    return response.type === "opaque" || response.type === "opaqueredirect" || response.status === 0;
  } catch {
    return false;
  }
}

function parseError(error: IiifParseError, url: string): IiifFetchError {
  return new IiifFetchError(error.code, error.message, { url, cause: error });
}

export async function fetchIiifJson(urlInput: string, options: IiifFetchOptions = {}): Promise<IiifInspection> {
  const url = normalizeHttpUrl(urlInput);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const maxBytes = Math.max(1, Math.floor(options.maxBytes ?? DEFAULT_MAX_BYTES));
  const pageUrl = browserPageUrl(options.pageUrl);
  const controller = new AbortController();
  let timedOut = false;

  const abortFromParent = (): void => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromParent();
  else options.signal?.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("IIIF fetch timed out", "TimeoutError"));
  }, timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        headers: { Accept: "application/ld+json, application/json;q=0.9, */*;q=0.1" },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        if (timedOut) {
          throw new IiifFetchError("IIIF.TIMEOUT", `IIIF request exceeded ${timeoutMs.toLocaleString()} ms.`, { url, cause: error });
        }
        throw new IiifFetchError("IIIF.ABORTED", "IIIF request was cancelled.", { url, cause: error });
      }

      if (error instanceof TypeError && isCrossOrigin(url, pageUrl)) {
        const reachableOpaque = await noCorsReachabilityProbe(fetchImpl, url, controller.signal);
        if (reachableOpaque) {
          throw new IiifFetchError(
            "IIIF.CORS_BLOCKED",
            "The browser can reach an opaque response, but CORS prevents the viewer from reading its status or IIIF JSON. This is an access/interoperability limitation, not proof that the IIIF resource is invalid.",
            { url, cause: error },
          );
        }
      }

      throw new IiifFetchError(
        "IIIF.NETWORK_ERROR",
        "The browser could not obtain the IIIF resource. This may be a network, DNS, TLS, mixed-content, extension, or CORS-related transport failure.",
        { url, cause: error },
      );
    }

    if (!response.ok) {
      throw new IiifFetchError(
        "IIIF.HTTP_ERROR",
        `IIIF request returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`,
        { url, status: response.status },
      );
    }

    const text = await boundedResponseText(response, maxBytes, url);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new IiifFetchError("IIIF.INVALID_JSON", "The fetched resource is not valid JSON.", { url, status: response.status, cause: error });
    }

    try {
      return parseIiifJson(json);
    } catch (error) {
      if (error instanceof IiifParseError) throw parseError(error, url);
      throw error;
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}

export async function loadIiifSource(rawInput: string, options: IiifFetchOptions = {}): Promise<{ url: string; inspection: IiifInspection }> {
  let url: string;
  try {
    url = inferIiifInputUrl(rawInput);
  } catch (error) {
    if (error instanceof IiifParseError) {
      throw new IiifFetchError("IIIF.URL_INVALID", error.message, { cause: error });
    }
    throw error;
  }
  const inspection = await fetchIiifJson(url, options);
  return { url, inspection };
}
