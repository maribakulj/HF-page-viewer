/// <reference lib="webworker" />

import { validateXmlWithXsd } from "./xsdValidationCore";
import type { XsdWorkerRequest, XsdWorkerResponse } from "./xsdValidationProtocol";

const context = self as DedicatedWorkerGlobalScope;

async function fetchSameOrigin(url: string): Promise<Uint8Array> {
  const target = new URL(url);
  if (target.origin !== context.location.origin) {
    throw new Error(`Refusing cross-origin schema asset: ${target.origin}`);
  }
  const response = await fetch(target, {
    credentials: "same-origin",
    cache: "force-cache",
  });
  if (!response.ok) {
    throw new Error(`Schema asset ${target.pathname} returned ${response.status}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

context.addEventListener("message", async (event: MessageEvent<XsdWorkerRequest>) => {
  const request = event.data;
  try {
    const entrySchema = await fetchSameOrigin(request.entryAssetUrl);
    const resourcePairs = await Promise.all(request.resources.map(async (resource) => [
      resource.virtualUrl,
      await fetchSameOrigin(resource.assetUrl),
    ] as const));
    const result = validateXmlWithXsd(new Uint8Array(request.xml), {
      descriptor: request.descriptor,
      entrySchema,
      resources: Object.fromEntries(resourcePairs),
    });
    const response: XsdWorkerResponse = { requestId: request.requestId, result };
    context.postMessage(response);
  } catch (error) {
    const response: XsdWorkerResponse = {
      requestId: request.requestId,
      result: {
        status: "error",
        stage: "schema",
        message: error instanceof Error ? error.message : String(error),
        diagnostics: [],
      },
    };
    context.postMessage(response);
  }
});

export {};
