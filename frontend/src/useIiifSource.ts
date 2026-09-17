import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IiifFetchError, fetchIiifJson, loadIiifSource } from "./iiifFetch";
import type { IiifImageService, IiifInspection } from "./iiifModel";
import {
  initialIiifSelection,
  resolveIiifSelection,
  selectedIiifService,
  selectionForCanvas,
} from "./iiifViewer";
import type { IiifResolvedSelection, IiifSelection } from "./iiifViewer";

export type IiifSourceState = {
  input: string;
  loadedUrl: string | null;
  inspection: IiifInspection | null;
  selection: IiifSelection;
  resolvedService: IiifImageService | null;
  resolved: IiifResolvedSelection | null;
  loading: boolean;
  serviceLoading: boolean;
  error: IiifFetchError | null;
  serviceError: IiifFetchError | null;
};

function asFetchError(error: unknown, fallback: string): IiifFetchError {
  if (error instanceof IiifFetchError) return error;
  return new IiifFetchError("IIIF.NETWORK_ERROR", error instanceof Error ? error.message : fallback, { cause: error });
}

const EMPTY_SELECTION: IiifSelection = { canvasIndex: null, imageIndex: null };

export function useIiifSource() {
  const [input, setInput] = useState("");
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [inspection, setInspection] = useState<IiifInspection | null>(null);
  const [selection, setSelection] = useState<IiifSelection>(EMPTY_SELECTION);
  const [resolvedService, setResolvedService] = useState<IiifImageService | null>(null);
  const [loading, setLoading] = useState(false);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [error, setError] = useState<IiifFetchError | null>(null);
  const [serviceError, setServiceError] = useState<IiifFetchError | null>(null);
  const loadControllerRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    loadControllerRef.current?.abort();
    loadControllerRef.current = null;
    setLoadedUrl(null);
    setInspection(null);
    setSelection(EMPTY_SELECTION);
    setResolvedService(null);
    setLoading(false);
    setServiceLoading(false);
    setError(null);
    setServiceError(null);
  }, []);

  const load = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoading(true);
    setError(null);
    setServiceError(null);
    setResolvedService(null);
    try {
      const loaded = await loadIiifSource(input, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setLoadedUrl(loaded.url);
      setInspection(loaded.inspection);
      setSelection(initialIiifSelection(loaded.inspection));
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setLoadedUrl(null);
      setInspection(null);
      setSelection(EMPTY_SELECTION);
      setError(asFetchError(loadError, "IIIF loading failed."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (loadControllerRef.current === controller) loadControllerRef.current = null;
    }
  }, [input]);

  const selectCanvas = useCallback((canvasIndex: number) => {
    if (!inspection) return;
    setSelection(selectionForCanvas(inspection, canvasIndex));
  }, [inspection]);

  const selectImage = useCallback((imageIndex: number | null) => {
    if (!inspection || inspection.kind !== "manifest" || selection.canvasIndex == null) return;
    const canvas = inspection.canvases[selection.canvasIndex];
    if (!canvas) return;
    if (imageIndex == null || imageIndex < 0 || imageIndex >= canvas.images.length) {
      setSelection((current) => ({ ...current, imageIndex: null }));
      return;
    }
    setSelection((current) => ({ ...current, imageIndex }));
  }, [inspection, selection.canvasIndex]);

  const referencedService = useMemo(
    () => inspection ? selectedIiifService(inspection, selection) : null,
    [inspection, selection],
  );

  useEffect(() => {
    setResolvedService(null);
    setServiceError(null);
    setServiceLoading(false);
    if (!referencedService) return;
    if (referencedService.width && referencedService.height) {
      setResolvedService(referencedService);
      return;
    }

    const controller = new AbortController();
    setServiceLoading(true);
    fetchIiifJson(referencedService.info_json_url, { signal: controller.signal })
      .then((serviceInspection) => {
        if (controller.signal.aborted) return;
        if (serviceInspection.kind !== "image_service" || !serviceInspection.image_service) {
          setServiceError(new IiifFetchError(
            "IIIF.INVALID_STRUCTURE",
            "The selected Image API service URL did not return Image API information.",
            { url: referencedService.info_json_url },
          ));
          return;
        }
        setResolvedService(serviceInspection.image_service);
      })
      .catch((serviceLoadError: unknown) => {
        if (controller.signal.aborted) return;
        setServiceError(asFetchError(serviceLoadError, "Image service inspection failed."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setServiceLoading(false);
      });
    return () => controller.abort();
  }, [referencedService]);

  useEffect(() => () => loadControllerRef.current?.abort(), []);

  const resolved = useMemo(
    () => inspection ? resolveIiifSelection(inspection, selection, resolvedService) : null,
    [inspection, resolvedService, selection],
  );

  const state: IiifSourceState = {
    input,
    loadedUrl,
    inspection,
    selection,
    resolvedService,
    resolved,
    loading,
    serviceLoading,
    error,
    serviceError,
  };

  return {
    state,
    setInput,
    load,
    clear,
    selectCanvas,
    selectImage,
  };
}
