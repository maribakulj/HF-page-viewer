import { describe, expect, it } from "vitest";

import type { SchemaDescriptor } from "./schemaRegistry";
import { resolveSchema } from "./schemaRegistry";
import { validateXmlWithXsd } from "./xsdValidationCore";

const encoder = new TextEncoder();

const SIMPLE_DESCRIPTOR: SchemaDescriptor = {
  id: "test-simple",
  label: "Test schema",
  sourceFormat: "alto",
  sourceVersion: "test",
  namespace: "urn:hf-page-viewer:test",
  entryVirtualUrl: "https://schemas.hf-page-viewer.invalid/test.xsd",
  entryAssetPath: "schemas/test.xsd",
  resources: [],
};

const SIMPLE_XSD = encoder.encode(`<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:hf-page-viewer:test" xmlns:t="urn:hf-page-viewer:test" elementFormDefault="qualified">
  <xs:element name="root">
    <xs:complexType>
      <xs:attribute name="value" type="xs:string" use="required"/>
    </xs:complexType>
  </xs:element>
</xs:schema>`);

function validate(xml: string) {
  return validateXmlWithXsd(encoder.encode(xml), {
    descriptor: SIMPLE_DESCRIPTOR,
    entrySchema: SIMPLE_XSD,
    resources: {},
  });
}

describe("XSD validation core", () => {
  it("accepts a schema-valid document", () => {
    const result = validate(`<root xmlns="urn:hf-page-viewer:test" value="ok"/>`);
    expect(result.status).toBe("valid");
    expect(result.diagnostics).toEqual([]);
  });

  it("returns structured diagnostics for a schema-invalid document", () => {
    const result = validate(`<root xmlns="urn:hf-page-viewer:test"/>`);
    expect(result.status).toBe("invalid");
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].message).toContain("attribute");
    expect(result.diagnostics[0].line).not.toBeNull();
  });

  it("returns a document-stage error for malformed XML", () => {
    const result = validate(`<root xmlns="urn:hf-page-viewer:test" value="ok">`);
    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("Expected validation error result");
    expect(result.stage).toBe("document");
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

describe("schema registry", () => {
  it("pins only exact ALTO 4.4 and PAGE 2019 baselines", () => {
    expect(resolveSchema({
      source_format: "alto",
      source_version: "4.4",
      namespace: "http://www.loc.gov/standards/alto/ns-v4#",
    }).status).toBe("supported");

    expect(resolveSchema({
      source_format: "page",
      source_version: "2019-07-15",
      namespace: "http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15",
    }).status).toBe("supported");

    expect(resolveSchema({
      source_format: "alto",
      source_version: "4.3",
      namespace: "http://www.loc.gov/standards/alto/ns-v4#",
    }).status).toBe("unsupported");
  });
});
