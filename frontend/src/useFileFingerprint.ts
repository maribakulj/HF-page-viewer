import { useEffect, useState } from "react";

import { fingerprintFile } from "./fileFingerprint";
import type { FileFingerprint } from "./fileFingerprint";

export type FileFingerprintState = {
  fingerprint: FileFingerprint | null;
  hashing: boolean;
  error: string | null;
};

export function useFileFingerprint(file: File | null): FileFingerprintState {
  const [state, setState] = useState<FileFingerprintState>({ fingerprint: null, hashing: false, error: null });

  useEffect(() => {
    let active = true;
    if (!file) {
      setState({ fingerprint: null, hashing: false, error: null });
      return () => { active = false; };
    }

    setState({ fingerprint: null, hashing: true, error: null });
    fingerprintFile(file)
      .then((fingerprint) => {
        if (active) setState({ fingerprint, hashing: false, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          fingerprint: null,
          hashing: false,
          error: error instanceof Error ? error.message : "SHA-256 hashing failed.",
        });
      });

    return () => { active = false; };
  }, [file]);

  return state;
}
