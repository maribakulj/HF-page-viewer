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

export async function fingerprintFile(file: File): Promise<FileFingerprint> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return {
    algorithm: "sha256",
    hex: hex(digest),
    bytes: file.size,
    name: file.name,
    media_type: file.type || null,
  };
}
