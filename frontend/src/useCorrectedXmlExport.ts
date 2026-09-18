import { useEffect, useState } from "react";

import type { BBoxEdit } from "./bboxEdits";
import { buildCorrectedXml, correctedXmlFilename } from "./correctedXml";
import type { CorrectedXmlResult } from "./correctedXml";
import { fingerprintText } from "./fileFingerprint";
import type { FileFingerprint } from "./fileFingerprint";
import type { PageDocumentDTO } from "./types";
import type { WordTextEdit } from "./wordEdits";

export type CorrectedXmlState = {
  result: CorrectedXmlResult | null;
  fingerprint: FileFingerprint | null;
  filename: string | null;
  building: boolean;
  error: string | null;
};

export function useCorrectedXmlExport(args: {
  sourceFile: File | null;
  document: PageDocumentDTO | null;
  wordTextEdits: WordTextEdit[];
  bboxEdits: BBoxEdit[];
}): CorrectedXmlState {
  const [state, setState] = useState<CorrectedXmlState>({
    result: null,
    fingerprint: null,
    filename: null,
    building: false,
    error: null,
  });

  useEffect(() => {
    const hasEdits = args.wordTextEdits.length > 0 || args.bboxEdits.length > 0;
    if (!args.sourceFile || !args.document || !hasEdits) {
      setState({ result: null, fingerprint: null, filename: null, building: false, error: null });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, building: true, error: null }));
    const filename = correctedXmlFilename(args.sourceFile.name);

    args.sourceFile.text()
      .then((sourceXml) => {
        const result = buildCorrectedXml({
          sourceXml,
          document: args.document!,
          wordTextEdits: args.wordTextEdits,
          bboxEdits: args.bboxEdits,
        });
        return fingerprintText(result.xml, filename).then((fingerprint) => ({ result, fingerprint }));
      })
      .then(({ result, fingerprint }) => {
        if (!cancelled) setState({ result, fingerprint, filename, building: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            result: null,
            fingerprint: null,
            filename,
            building: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [args.bboxEdits, args.document, args.sourceFile, args.wordTextEdits]);

  return state;
}
