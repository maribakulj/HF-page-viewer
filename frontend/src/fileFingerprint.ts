export type FileFingerprint = {
  algorithm: "sha256";
  hex: string;
  bytes: number;
  name: string;
  media_type: string | null;
};

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fingerprintBytes(
  bytes: ArrayBuffer,
  name: string,
  mediaType: string | null,
): Promise<FileFingerprint> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return {
    algorithm: "sha256",
    hex: hex(digest),
    bytes: bytes.byteLength,
    name,
    media_type: mediaType,
  };
}

export async function fingerprintText(
  value: string,
  name: string,
  mediaType = "application/xml",
): Promise<FileFingerprint> {
  const bytes = new TextEncoder().encode(value);
  return fingerprintBytes(bytes.buffer as ArrayBuffer, name, mediaType);
}

export async function fingerprintFile(file: File): Promise<FileFingerprint> {
  const bytes = await file.arrayBuffer();
  return fingerprintBytes(bytes, file.name, file.type || null);
}
