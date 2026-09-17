import {
  ParseOption,
  XmlBufferInputProvider,
  XmlDocument,
  XmlLibError,
  XmlValidateError,
  XsdValidator,
  xmlCleanupInputProvider,
  xmlRegisterInputProvider,
} from "libxml2-wasm";

import type { ErrorDetail } from "libxml2-wasm";
import type { SchemaDescriptor } from "./schemaRegistry";

export type XsdDiagnostic = {
  message: string;
  file: string | null;
  level: number;
  line: number | null;
  column: number | null;
  xpath: string | null;
};

export type XsdValidationResult =
  | { status: "valid"; diagnostics: XsdDiagnostic[] }
  | { status: "invalid"; diagnostics: XsdDiagnostic[] }
  | { status: "error"; stage: "load" | "schema" | "document" | "validation"; message: string; diagnostics: XsdDiagnostic[] };

export type XsdSchemaBundle = {
  descriptor: SchemaDescriptor;
  entrySchema: Uint8Array;
  resources: Record<string, Uint8Array>;
};

const SAFE_PARSE_OPTIONS = (
  ParseOption.XML_PARSE_NONET
  | ParseOption.XML_PARSE_BIG_LINES
  | ParseOption.XML_PARSE_NO_XXE
  | ParseOption.XML_PARSE_NO_SYS_CATALOG
);

function diagnostic(detail: ErrorDetail): XsdDiagnostic {
  return {
    message: detail.message.trim(),
    file: detail.file ?? null,
    level: detail.level,
    line: detail.line > 0 ? detail.line : null,
    column: detail.col > 0 ? detail.col : null,
    xpath: detail.xpath ?? null,
  };
}

function diagnosticsFrom(error: unknown): XsdDiagnostic[] {
  if (!(error instanceof XmlLibError)) return [];
  return error.details.map(diagnostic);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.trim() : String(error);
}

/**
 * Validate XML against one already-loaded, pinned XSD bundle.
 *
 * This function performs no network I/O. External schema imports/includes can only resolve
 * through the explicit in-memory resource map supplied by the caller. All libxml2/WASM
 * objects are disposed synchronously before the function returns.
 */
export function validateXmlWithXsd(xmlBytes: Uint8Array, bundle: XsdSchemaBundle): XsdValidationResult {
  let providerRegistered = false;
  let schemaDocument: XmlDocument | null = null;
  let validator: XsdValidator | null = null;
  let instanceDocument: XmlDocument | null = null;

  try {
    const providerResources = { ...bundle.resources };
    // Some schema processors or edited schemas may normalize LOC's historic HTTP import to HTTPS.
    const locHttp = "http://www.loc.gov/standards/xlink/xlink.xsd";
    const locHttps = "https://www.loc.gov/standards/xlink/xlink.xsd";
    if (providerResources[locHttp] && !providerResources[locHttps]) {
      providerResources[locHttps] = providerResources[locHttp];
    }

    if (Object.keys(providerResources).length > 0) {
      providerRegistered = xmlRegisterInputProvider(new XmlBufferInputProvider(providerResources));
      if (!providerRegistered) {
        return {
          status: "error",
          stage: "schema",
          message: "libxml2 refused the closed in-memory schema resource provider.",
          diagnostics: [],
        };
      }
    }

    try {
      schemaDocument = XmlDocument.fromBuffer(bundle.entrySchema, {
        url: bundle.descriptor.entryVirtualUrl,
        option: SAFE_PARSE_OPTIONS,
      });
      validator = XsdValidator.fromDoc(schemaDocument);
    } catch (error) {
      return {
        status: "error",
        stage: "schema",
        message: errorMessage(error),
        diagnostics: diagnosticsFrom(error),
      };
    }

    try {
      instanceDocument = XmlDocument.fromBuffer(xmlBytes, {
        url: "https://documents.hf-page-viewer.invalid/input.xml",
        option: SAFE_PARSE_OPTIONS,
      });
    } catch (error) {
      return {
        status: "error",
        stage: "document",
        message: errorMessage(error),
        diagnostics: diagnosticsFrom(error),
      };
    }

    try {
      validator.validate(instanceDocument);
      return {
        status: "valid",
        diagnostics: instanceDocument.warnings.map(diagnostic),
      };
    } catch (error) {
      if (error instanceof XmlValidateError) {
        return {
          status: "invalid",
          diagnostics: error.details.map(diagnostic),
        };
      }
      return {
        status: "error",
        stage: "validation",
        message: errorMessage(error),
        diagnostics: diagnosticsFrom(error),
      };
    }
  } finally {
    instanceDocument?.dispose();
    validator?.dispose();
    schemaDocument?.dispose();
    if (providerRegistered) xmlCleanupInputProvider();
  }
}
