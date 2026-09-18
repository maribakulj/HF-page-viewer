import { useEffect, useState } from "react";

import type { BBoxEdit } from "./bboxEdits";
import { buildCorrectedXml, correctedXmlFilename } from "./correctedXml";
import type { CorrectedXmlResult } from "./correctedXml";
import { fingerprintText } from "./fileFingerprint";
import type { FileFingerprint } from "./fileFingerprint";
import type { PageDocumentDTO } from "./types";
import type { WordTextEdit } from "./wordEdits";
import { validateFileWithPinnedXsd } from "./xsdValidationClient";
import type { BrowserXsdValidation } from "./xsdValidationProtocol";

export type CorrectedXmlState = {
  result: CorrectedXmlResult | null;
  fingerprint: FileFingerprint | null;
  filename: string | null;
  xsdValidation: BrowserXsdValidation;
  building: boolean;
  error: string | null;
};

const EMPTY_STATE: CorrectedXmlState = {
  result: null,
  fingerprint: null,
  filename: null,
  xsdValidation: { status: "idle" },
  building: false,
  error: null,
};

export function useCorrectedXmlExport(args: {
  sourceFile: File | null;
  document: PageDocumentDTO | null;
  wordTextEdits: WordTextEdit[];
  bboxEdits: BBoxEdit[];
}): CorrectedXmlState {
  const [state, setState] = useState<CorrectedXmlState>(EMPTY_STATE);

  useEffect(() => {
    const hasEdits = args.wordTextEdits.length > 0 || args.bboxEdits.length > 0;
    if (!args.sourceFile || !args.document || !hasEdits) {
      setState(EMPTY_STATE);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState((current) => ({ ...current, building: true, error: null, xsdValidation: { status: "idle" } }));
    const filename = correctedXmlFilename(args.sourceFile.name);

    args.sourceFile.text()
      .then(async (sourceXml) => {
        const result = buildCorrectedXml({
          sourceXml,
          document: args.document!,
          wordTextEdits: args.wordTextEdits,
          bboxEdits: args.bboxEdits,
        });
        const fingerprint = await fingerprintText(result.xml, filename);
        const correctedFile = new File([result.xml], filename, { type: "application/xml" });
        const xsdValidation = await validateFileWithPinnedXsd(correctedFile, args.document!, controller.signal);
        return { result, fingerprint, xsdValidation };
      })
      .then(({ result, fingerprint, xsdValidation }) => {
        if (!cancelled) setState({ result, fingerprint, filename, xsdValidation, building: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || cancelled) return;
        setState({
          result: null,
          fingerprint: null,
          filename,
          xsdValidation: { status: "idle" },
          building: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [args.bboxEdits, args.document, args.sourceFile, args.wordTextEdits]);

  return state;
}
