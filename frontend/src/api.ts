import type { PageDocumentDTO } from "./types";

type ApiErrorPayload = {
  detail?: string | { code?: string; message?: string };
};

function errorMessage(payload: ApiErrorPayload | null, fallback: string): string {
  if (!payload?.detail) return fallback;
  if (typeof payload.detail === "string") return payload.detail;
  return payload.detail.message ?? payload.detail.code ?? fallback;
}

export async function parseAltoFile(
  file: File,
  signal?: AbortSignal,
): Promise<PageDocumentDTO> {
  const response = await fetch("/api/alto/parse", {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: file,
    signal,
  });

  if (!response.ok) {
    let payload: ApiErrorPayload | null = null;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = null;
    }
    throw new Error(errorMessage(payload, `ALTO parsing failed (${response.status})`));
  }

  return (await response.json()) as PageDocumentDTO;
}
