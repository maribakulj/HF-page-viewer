import { describe, expect, it } from "vitest";

import { fingerprintFile } from "./fileFingerprint";

describe("fingerprintFile", () => {
  it("computes a stable SHA-256 fingerprint without uploading the file", async () => {
    const file = new File(["abc"], "sample.xml", { type: "application/xml" });
    const result = await fingerprintFile(file);

    expect(result).toEqual({
      algorithm: "sha256",
      hex: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      bytes: 3,
      name: "sample.xml",
      media_type: "application/xml",
    });
  });
});
