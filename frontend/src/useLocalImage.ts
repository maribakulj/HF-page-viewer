import { useEffect, useState } from "react";

import type { ImageInfo } from "./types";

export function useLocalImage(file: File | null): {
  image: ImageInfo | null;
  error: string | null;
} {
  const [image, setImage] = useState<ImageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setImage(null);
    setError(null);
    if (!file) return;

    const url = URL.createObjectURL(file);
    const probe = new window.Image();
    let cancelled = false;

    probe.onload = () => {
      if (cancelled) return;
      setImage({
        url,
        name: file.name,
        width: probe.naturalWidth,
        height: probe.naturalHeight,
      });
    };
    probe.onerror = () => {
      if (cancelled) return;
      setError("The selected image could not be decoded by the browser.");
    };
    probe.src = url;

    return () => {
      cancelled = true;
      probe.src = "";
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return { image, error };
}
