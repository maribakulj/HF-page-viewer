import { describe, expect, it } from "vitest";

import { buildCorrectedXml } from "./correctedXml";
import type { PageDocumentDTO } from "./types";

const altoDocument: PageDocumentDTO = {
  source_format: "alto",
  source_version: "4.4",
  namespace: "http://www.loc.gov/standards/alto/ns-v4#",
  pages: [],
  metadata: [],
  processing_steps: [],
  extensions: [],
  notices: [],
  source_attributes: {},
};

const pageDocument: PageDocumentDTO = {
  ...altoDocument,
  source_format: "page_xml",
  source_version: "2019-07-15",
  namespace: "http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15",
};

describe("buildCorrectedXml", () => {
  it("patches ALTO word text and bbox while preserving unrelated source structure", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#">
  <Description><MeasurementUnit>pixel</MeasurementUnit><sourceImageInformation><fileName>page.jpg</fileName></sourceImageInformation></Description>
  <Layout><Page ID="p1" WIDTH="1000" HEIGHT="2000"><PrintSpace HPOS="0" VPOS="0" WIDTH="1000" HEIGHT="2000"><TextBlock ID="b1" HPOS="10" VPOS="10" WIDTH="900" HEIGHT="300"><TextLine ID="l1" HPOS="20" VPOS="20" WIDTH="800" HEIGHT="40"><String ID="w1" CONTENT="hello" HPOS="30" VPOS="20" WIDTH="80" HEIGHT="40"/></TextLine></TextBlock></PrintSpace></Page></Layout>
  <Tags><OtherTag ID="t1" LABEL="keep-me"/></Tags>
</alto>`;

    const result = buildCorrectedXml({
      sourceXml: xml,
      document: altoDocument,
      wordTextEdits: [{
        kind: "word_text",
        target_key: "word:w1",
        page_index: 0,
        element_id: "w1",
        source_path: "/alto/Layout/Page/PrintSpace/TextBlock/TextLine/String",
        before: "hello",
        after: "hullo",
      }],
      bboxEdits: [{
        kind: "bbox",
        target_kind: "word",
        target_key: "word:w1",
        page_index: 0,
        element_id: "w1",
        source_path: "/alto/Layout/Page/PrintSpace/TextBlock/TextLine/String",
        before: { kind: "bbox", x: 30, y: 20, width: 80, height: 40 },
        after: { kind: "bbox", x: 32, y: 21, width: 84, height: 41 },
      }],
    });

    expect(result.applied_word_text_edits).toBe(1);
    expect(result.applied_bbox_edits).toBe(1);
    expect(result.skipped_edits).toBe(0);
    expect(result.xml).toContain('CONTENT="hullo"');
    expect(result.xml).toContain('HPOS="32"');
    expect(result.xml).toContain('VPOS="21"');
    expect(result.xml).toContain('WIDTH="84"');
    expect(result.xml).toContain('HEIGHT="41"');
    expect(result.xml).toContain('LABEL="keep-me"');
  });

  it("patches PAGE word Unicode but refuses lossy bbox serialization", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PcGts xmlns="http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15">
  <Page imageWidth="1000" imageHeight="2000">
    <TextRegion id="r1"><Coords points="0,0 900,0 900,300 0,300"/>
      <TextLine id="l1"><Coords points="0,0 800,0 800,40 0,40"/>
        <Word id="w1"><Coords points="30,20 110,20 110,60 30,60"/><TextEquiv><Unicode>hello</Unicode></TextEquiv></Word>
      </TextLine>
    </TextRegion>
  </Page>
  <Metadata><Creator>keep-me</Creator></Metadata>
</PcGts>`;

    const result = buildCorrectedXml({
      sourceXml: xml,
      document: pageDocument,
      wordTextEdits: [{
        kind: "word_text",
        target_key: "word:w1",
        page_index: 0,
        element_id: "w1",
        source_path: "/PcGts/Page/TextRegion/TextLine/Word",
        before: "hello",
        after: "hullo",
      }],
      bboxEdits: [{
        kind: "bbox",
        target_kind: "word",
        target_key: "word:w1",
        page_index: 0,
        element_id: "w1",
        source_path: "/PcGts/Page/TextRegion/TextLine/Word",
        before: { kind: "bbox", x: 30, y: 20, width: 80, height: 40 },
        after: { kind: "bbox", x: 32, y: 21, width: 84, height: 41 },
      }],
    });

    expect(result.applied_word_text_edits).toBe(1);
    expect(result.applied_bbox_edits).toBe(0);
    expect(result.skipped_edits).toBe(1);
    expect(result.warnings[0]?.code).toBe("EXPORT.PAGE_BBOX_UNSUPPORTED");
    expect(result.xml).toContain("<Unicode>hullo</Unicode>");
    expect(result.xml).toContain('points="30,20 110,20 110,60 30,60"');
    expect(result.xml).toContain("<Creator>keep-me</Creator>");
  });
});
