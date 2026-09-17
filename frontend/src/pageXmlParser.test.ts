import { describe, expect, it } from "vitest";

import { parseDocumentString } from "./documentParser";
import { parsePageXmlString } from "./pageXmlParser";

const PAGE_2019 = `<?xml version="1.0"?>
<PcGts xmlns="http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15">
  <Metadata><Creator>HF Page Viewer test</Creator><Created>2026-09-17T00:00:00Z</Created><LastChange>2026-09-17T00:00:00Z</LastChange></Metadata>
  <Page imageFilename="page.jpg" imageWidth="1000" imageHeight="2000">
    <ReadingOrder><OrderedGroup id="ro"><RegionRefIndexed regionRef="r1" index="0"/></OrderedGroup></ReadingOrder>
    <TextRegion id="r1" type="paragraph" primaryLanguage="French">
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

describe("PAGE XML browser parser", () => {
  it("normalizes PAGE 2019 geometry, text and reading order", () => {
    const document = parsePageXmlString(PAGE_2019);
    expect(document.source_format).toBe("page_xml");
    expect(document.source_version).toBe("2019-07-15");
    expect(document.pages[0].width).toBe(1000);
    expect(document.pages[0].measurement_unit).toBe("pixel");
    expect(document.pages[0].reading_order?.refs).toEqual(["r1"]);
    expect(document.pages[0].regions[0].region_type).toBe("text:paragraph");
    expect(document.pages[0].regions[0].lines[0].baseline?.points).toHaveLength(2);
    expect(document.pages[0].regions[0].lines[0].words[0].text_alternatives[0].text).toBe("Bonjour");
    expect(document.pages[0].regions[0].lines[0].words[0].glyphs[0].confidence).toBe(0.97);
  });

  it("auto-detects PAGE and ALTO through the common document parser", () => {
    expect(parseDocumentString(PAGE_2019).source_format).toBe("page_xml");
    const alto = `<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#" SCHEMAVERSION="4.4"><Description><MeasurementUnit>pixel</MeasurementUnit></Description><Layout><Page ID="p" WIDTH="1" HEIGHT="1"/></Layout></alto>`;
    expect(parseDocumentString(alto).source_format).toBe("alto");
  });

  it("reports dangling PAGE reading-order references", () => {
    const broken = PAGE_2019.replace('regionRef="r1"', 'regionRef="missing"');
    expect(parsePageXmlString(broken).notices.some((notice) => notice.code === "page.dangling_reference")).toBe(true);
  });

  it("rejects entity declarations", () => {
    expect(() => parseDocumentString(`<!DOCTYPE PcGts [<!ENTITY x SYSTEM "file:///etc/passwd">]>${PAGE_2019}`)).toThrow(/DTD|entity/i);
  });
});
