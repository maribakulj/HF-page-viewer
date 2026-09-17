import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSchema } from "./schemaRegistry";
import type { SchemaDescriptor } from "./schemaRegistry";
import { validateXmlWithXsd } from "./xsdValidationCore";

const encoder = new TextEncoder();
const schemaDir = resolve(process.cwd(), "public/schemas");

function descriptorFor(sourceFormat: "alto" | "page_xml", sourceVersion: string, namespace: string): SchemaDescriptor {
  const resolution = resolveSchema({ source_format: sourceFormat, source_version: sourceVersion, namespace });
  if (resolution.status !== "supported") throw new Error(resolution.reason);
  return resolution.descriptor;
}

function validate(xml: string, descriptor: SchemaDescriptor) {
  const resources = Object.fromEntries(descriptor.resources.map((resource) => [
    resource.virtualUrl,
    new Uint8Array(readFileSync(resolve(process.cwd(), "public", resource.assetPath))),
  ]));
  return validateXmlWithXsd(encoder.encode(xml), {
    descriptor,
    entrySchema: new Uint8Array(readFileSync(resolve(process.cwd(), "public", descriptor.entryAssetPath))),
    resources,
  });
}

const ALTO_DESCRIPTOR = descriptorFor("alto", "4.4", "http://www.loc.gov/standards/alto/ns-v4#");
const PAGE_DESCRIPTOR = descriptorFor("page_xml", "2019-07-15", "http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15");

const ALTO_44 = `<?xml version="1.0"?>
<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#" SCHEMAVERSION="4.4">
  <Description>
    <MeasurementUnit>pixel</MeasurementUnit>
    <sourceImageInformation><fileName>page.jpg</fileName></sourceImageInformation>
  </Description>
  <Layout>
    <Page ID="p1" WIDTH="1000" HEIGHT="2000" PHYSICAL_IMG_NR="1" LANG="fra">
      <PrintSpace ID="ps" HPOS="0" VPOS="0" WIDTH="1000" HEIGHT="2000">
        <TextBlock ID="b1" HPOS="10" VPOS="20" WIDTH="300" HEIGHT="80">
          <TextLine ID="l1" HPOS="10" VPOS="20" WIDTH="300" HEIGHT="30" BASELINE="10 45 310 45">
            <String ID="w1" CONTENT="Bonjour" WC="0.98" HPOS="10" VPOS="20" WIDTH="100" HEIGHT="30"/>
          </TextLine>
        </TextBlock>
      </PrintSpace>
    </Page>
  </Layout>
</alto>`;

const PAGE_2019 = `<?xml version="1.0"?>
<PcGts xmlns="http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15">
  <Metadata>
    <Creator>HF Page Viewer test</Creator>
    <Created>2026-09-17T00:00:00Z</Created>
    <LastChange>2026-09-17T00:00:00Z</LastChange>
  </Metadata>
  <Page imageFilename="page.jpg" imageWidth="1000" imageHeight="2000">
    <ReadingOrder><OrderedGroup id="ro"><RegionRefIndexed regionRef="r1" index="0"/></OrderedGroup></ReadingOrder>
    <TextRegion id="r1" type="paragraph" primaryLanguage="fra">
      <Coords points="10,20 410,20 410,200 10,200"/>
      <TextLine id="l1">
        <Coords points="20,40 400,40 400,90 20,90"/>
        <Baseline points="20,82 400,82"/>
        <Word id="w1">
          <Coords points="20,40 140,40 140,90 20,90"/>
          <Glyph id="g1"><Coords points="20,40 40,40 40,90 20,90"/><TextEquiv conf="0.97"><Unicode>B</Unicode></TextEquiv></Glyph>
          <TextEquiv conf="0.95"><Unicode>Bonjour</Unicode></TextEquiv>
        </Word>
        <TextEquiv conf="0.94"><Unicode>Bonjour monde</Unicode></TextEquiv>
      </TextLine>
      <TextEquiv><Unicode>Bonjour monde</Unicode></TextEquiv>
    </TextRegion>
  </Page>
</PcGts>`;

describe("pinned official schemas", () => {
  it("accepts representative ALTO 4.4", () => {
    const result = validate(ALTO_44, ALTO_DESCRIPTOR);
    expect(result, result.status === "error" ? result.message : JSON.stringify(result.diagnostics)).toMatchObject({ status: "valid" });
  });

  it("rejects ALTO 4.4 missing required page dimensions", () => {
    const result = validate(ALTO_44.replace(' WIDTH="1000" HEIGHT="2000"', ""), ALTO_DESCRIPTOR);
    expect(result.status).toBe("invalid");
    expect(result.diagnostics.some((item) => /WIDTH|HEIGHT/i.test(item.message))).toBe(true);
  });

  it("accepts representative PAGE XML 2019-07-15", () => {
    const result = validate(PAGE_2019, PAGE_DESCRIPTOR);
    expect(result, result.status === "error" ? result.message : JSON.stringify(result.diagnostics)).toMatchObject({ status: "valid" });
  });

  it("rejects PAGE XML missing required image dimensions", () => {
    const result = validate(PAGE_2019.replace(' imageWidth="1000" imageHeight="2000"', ""), PAGE_DESCRIPTOR);
    expect(result.status).toBe("invalid");
    expect(result.diagnostics.some((item) => /imageWidth|imageHeight/i.test(item.message))).toBe(true);
  });
});
