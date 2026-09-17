import type { SchemaDescriptor } from "./schemaRegistry";
import type { XsdValidationResult } from "./xsdValidationCore";

export type XsdWorkerResource = {
  virtualUrl: string;
  assetUrl: string;
};

export type XsdWorkerRequest = {
  requestId: string;
  xml: ArrayBuffer;
  descriptor: SchemaDescriptor;
  entryAssetUrl: string;
  resources: XsdWorkerResource[];
};

export type XsdWorkerResponse = {
  requestId: string;
  result: XsdValidationResult;
};

export type BrowserXsdValidation =
  | { status: "idle" }
  | { status: "validating"; schemaId: string; schemaLabel: string }
  | { status: "unsupported"; reason: string }
  | { status: "valid"; schemaId: string; schemaLabel: string; diagnostics: XsdValidationResult extends { diagnostics: infer D } ? D : never }
  | { status: "invalid"; schemaId: string; schemaLabel: string; diagnostics: XsdValidationResult extends { diagnostics: infer D } ? D : never }
  | { status: "error"; schemaId: string; schemaLabel: string; stage: "load" | "schema" | "document" | "validation"; message: string; diagnostics: XsdValidationResult extends { diagnostics: infer D } ? D : never };
