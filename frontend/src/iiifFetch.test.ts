import { describe, expect, it, vi } from "vitest";

import { IiifFetchError, fetchIiifJson, loadIiifSource } from "./iiifFetch";

const IMAGE_INFO_3 = {
  "@context": "http://iiif.io/api/image/3/context.json",
  id: "https://images.example.org/iiif/3/page-1",
  type: "ImageService3",
  protocol: "http://iiif.io/api/image",
  profile: "level2",
  width: 3000,
  height: 4000,
};

function fetchStub(implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch {
  return implementation as typeof fetch;
}

describe("IIIF browser fetch", () => {
  it("loads and normalizes JSON with credential-free CORS fetch", async () => {
    const implementation = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.mode).toBe("cors");
      expect(init?.credentials).toBe("omit");
      return new Response(JSON.stringify(IMAGE_INFO_3), {
        status: 200,
        headers: { "content-type": "application/ld+json" },
      });
    });

    const result = await fetchIiifJson("https://images.example.org/iiif/3/page-1/info.json", {
      fetchImpl: fetchStub(implementation),
      pageUrl: "https://viewer.example.org/",
    });

    expect(result.version).toBe("image-3");
    expect(result.image_service?.width).toBe(3000);
    expect(implementation).toHaveBeenCalledTimes(1);
  });

  it("normalizes an Image API service base before fetching", async () => {
    const implementation = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://images.example.org/iiif/3/page-1/info.json");
      return new Response(JSON.stringify(IMAGE_INFO_3), { status: 200 });
    });

    const loaded = await loadIiifSource("https://images.example.org/iiif/3/page-1", {
      fetchImpl: fetchStub(implementation),
      pageUrl: "https://viewer.example.org/",
    });

    expect(loaded.url).toBe("https://images.example.org/iiif/3/page-1/info.json");
  });

  it("reports HTTP errors separately from malformed IIIF", async () => {
    const implementation = vi.fn(async () => new Response("not found", { status: 404, statusText: "Not Found" }));

    await expect(fetchIiifJson("https://example.org/manifest.json", {
      fetchImpl: fetchStub(implementation),
    })).rejects.toMatchObject({ code: "IIIF.HTTP_ERROR", status: 404 });
  });

  it("reports invalid JSON with a stable code", async () => {
    const implementation = vi.fn(async () => new Response("{ definitely not json", { status: 200 }));

    await expect(fetchIiifJson("https://example.org/manifest.json", {
      fetchImpl: fetchStub(implementation),
    })).rejects.toMatchObject({ code: "IIIF.INVALID_JSON" });
  });

  it("enforces the advertised response-size limit before reading the body", async () => {
    const implementation = vi.fn(async () => new Response("{}", {
      status: 200,
      headers: { "content-length": "9999" },
    }));

    await expect(fetchIiifJson("https://example.org/manifest.json", {
      fetchImpl: fetchStub(implementation),
      maxBytes: 100,
    })).rejects.toMatchObject({ code: "IIIF.RESPONSE_TOO_LARGE" });
  });

  it("classifies an opaque no-cors probe as a CORS interoperability limitation", async () => {
    const implementation = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.mode === "cors") throw new TypeError("Failed to fetch");
      return { type: "opaque", status: 0 } as Response;
    });

    await expect(fetchIiifJson("https://remote.example.org/manifest.json", {
      fetchImpl: fetchStub(implementation),
      pageUrl: "https://viewer.example.org/",
    })).rejects.toMatchObject({ code: "IIIF.CORS_BLOCKED" });
    expect(implementation).toHaveBeenCalledTimes(2);
  });

  it("keeps transport failure distinct when the no-cors probe also fails", async () => {
    const implementation = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(fetchIiifJson("https://remote.example.org/manifest.json", {
      fetchImpl: fetchStub(implementation),
      pageUrl: "https://viewer.example.org/",
    })).rejects.toMatchObject({ code: "IIIF.NETWORK_ERROR" });
  });

  it("reports timeout separately from ordinary network errors", async () => {
    const implementation = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError")), { once: true });
    }));

    await expect(fetchIiifJson("https://remote.example.org/manifest.json", {
      fetchImpl: fetchStub(implementation),
      timeoutMs: 5,
      pageUrl: "https://viewer.example.org/",
    })).rejects.toMatchObject({ code: "IIIF.TIMEOUT" });
  });

  it("rejects non-http input before network access", async () => {
    const implementation = vi.fn(async () => new Response("{}"));

    await expect(loadIiifSource("file:///tmp/info.json", {
      fetchImpl: fetchStub(implementation),
    })).rejects.toBeInstanceOf(IiifFetchError);
    await expect(loadIiifSource("file:///tmp/info.json", {
      fetchImpl: fetchStub(implementation),
    })).rejects.toMatchObject({ code: "IIIF.URL_INVALID" });
    expect(implementation).not.toHaveBeenCalled();
  });
});
