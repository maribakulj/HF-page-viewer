import { describe, expect, it } from "vitest";

import { parseAltoString } from "./altoParser";

const ALTO_44 = `<?xml version="1.0"?>
<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#" SCHEMAVERSION="4.4">
  <Description><MeasurementUnit>pixel</MeasurementUnit><sourceImageInformation><fileName>page.jpg</fileName></sourceImageInformation></Description>
  <Layout><Page ID="p1" WIDTH="1000" HEIGHT="2000" LANG="fra"><PrintSpace ID="ps" HPOS="0" VPOS="0" WIDTH="1000" HEIGHT="2000"><TextBlock ID="b1" HPOS="10" VPOS="20" WIDTH="300" HEIGHT="80"><TextLine ID="l1" HPOS="10" VPOS="20" WIDTH="300" HEIGHT="30" BASELINE="10 45 310 45"><String ID="w1" CONTENT="Bonjour" WC="0.98" HPOS="10" VPOS="20" WIDTH="100" HEIGHT="30"/></TextLine></TextBlock></PrintSpace></Page></Layout>
</alto>`;

describe("browser ALTO parser", () => {
  it("normalizes a v4.4 page", () => {
    const document = parseAltoString(ALTO_44);
    expect(document.source_version).toBe("4.4");
    expect(document.pages[0].width).toBe(1000);
    expect(document.pages[0].measurement_unit).toBe("pixel");
    expect(document.pages[0].regions[0].regions[0].lines[0].words[0].text_alternatives[0].text).toBe("Bonjour");
  });

  it("accepts a v2 namespace", () => {
    const xml = ALTO_44.replace("ns-v4#", "ns-v2#").replace('SCHEMAVERSION="4.4"', 'SCHEMAVERSION="2.1"');
    expect(parseAltoString(xml).source_version).toBe("2.1");
  });

  it("rejects DTD/entity declarations", () => {
    expect(() => parseAltoString(`<!DOCTYPE alto [<!ENTITY x SYSTEM "file:///etc/passwd">]><alto xmlns="http://www.loc.gov/standards/alto/ns-v4#"/>`)).toThrow(/DTD|entity/i);
  });

  it("rejects malformed XML", () => {
    expect(() => parseAltoString(`<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#"><Layout>`)).toThrow(/XML|Malformed/i);
  });
});
