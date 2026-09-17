import { resolveSchema } from "./schemaRegistry";
import type { PageDocumentDTO } from "./types";
import type { BrowserXsdValidation, XsdWorkerRequest, XsdWorkerResponse } from "./xsdValidationProtocol";

function assetUrl(assetPath: string): string {
  return new URL(assetPath.replace(/^\//, ""), new URL("./", window.location.href)).toString();
}

function abortError(): DOMException {
  return new DOMException("XSD validation aborted.", "AbortError");
}

export async function validateFileWithPinnedXsd(
  file: File,
  document: PageDocumentDTO,
  signal?: AbortSignal,
): Promise<BrowserXsdValidation> {
  const resolution = resolveSchema(document);
  if (resolution.status === "unsupported") {
    return { status: "unsupported", reason: resolution.reason };
  }

  if (signal?.aborted) throw abortError();

  const descriptor = resolution.descriptor;
  const xml = await file.arrayBuffer();
  if (signal?.aborted) throw abortError();

  const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const request: XsdWorkerRequest = {
    requestId,
    xml,
    descriptor,
    entryAssetUrl: assetUrl(descriptor.entryAssetPath),
    resources: descriptor.resources.map((resource) => ({
      virtualUrl: resource.virtualUrl,
      assetUrl: assetUrl(resource.assetPath),
    })),
  };

  return await new Promise<BrowserXsdValidation>((resolve, reject) => {
    const worker = new Worker(new URL("./xsdValidation.worker.ts", import.meta.url), { type: "module" });
    let settled = false;

    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      callback();
    };

    const onAbort = (): void => finish(() => reject(abortError()));
    signal?.addEventListener("abort", onAbort, { once: true });

    worker.addEventListener("error", (event) => {
      finish(() => resolve({
        status: "error",
        schemaId: descriptor.id,
        schemaLabel: descriptor.label,
        stage: "load",
        message: event.message || "XSD validation worker failed.",
        diagnostics: [],
      }));
    }, { once: true });

    worker.addEventListener("message", (event: MessageEvent<XsdWorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      const result = event.data.result;
      finish(() => {
        if (result.status === "valid") {
          resolve({ status: "valid", schemaId: descriptor.id, schemaLabel: descriptor.label, diagnostics: result.diagnostics });
        } else if (result.status === "invalid") {
          resolve({ status: "invalid", schemaId: descriptor.id, schemaLabel: descriptor.label, diagnostics: result.diagnostics });
        } else {
          resolve({
            status: "error",
            schemaId: descriptor.id,
            schemaLabel: descriptor.label,
            stage: result.stage,
            message: result.message,
            diagnostics: result.diagnostics,
          });
        }
      });
    });

    worker.postMessage(request, [xml]);
  });
}
