from __future__ import annotations

from pathlib import Path

import pytest

from hf_page_viewer.domain import BBox, MeasurementUnit, Polygon, SourceFormat
from hf_page_viewer.parsers.alto import ALTOParseError, parse_alto, parse_alto_bytes
from hf_page_viewer.parsers.xml import parse_xml

FIXTURES = Path(__file__).parent / "fixtures" / "alto"


def _fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_parses_alto_4_4_vertical_slice() -> None:
    document = parse_alto_bytes(_fixture("alto_4_4.xml"))

    assert document.source_format is SourceFormat.ALTO
    assert document.source_version == "4.4"
    assert document.pages[0].measurement_unit is MeasurementUnit.PIXEL
    assert document.pages[0].width == 1000
    assert document.pages[0].height == 1500
    assert document.pages[0].image_reference == "page-001.tif"
    assert document.pages[0].source_ref is not None
    assert dict(document.pages[0].source_ref.attributes)["LANG"] == "fr"
    assert dict(document.pages[0].source_ref.attributes)["ROTATION"] == "0"
    assert document.pages[0].language == "fr"
    assert document.pages[0].other_languages == ("la",)
    assert document.pages[0].rotation == 0

    metadata = {item.label: item.value for item in document.metadata}
    assert metadata["source_image.file_name"] == "page-001.tif"
    assert metadata["source_image.document_identifier"] == "ark:/12148/example"

    assert document.processing_steps[0].software_name == "Example OCR"
    assert document.processing_steps[0].software_version == "1.2.3"
    assert dict(document.processing_steps[0].attributes)["processing_agency"] == "Example Lab"

    extensions = {(item.category, item.name, item.identifier) for item in document.extensions}
    assert ("style", "TextStyle", "TS1") in extensions
    assert ("style", "ParagraphStyle", "PS1") in extensions
    assert ("tag", "LayoutTag", "TAG1") in extensions

    page = document.pages[0]
    assert page.reading_order is not None
    assert page.reading_order.ordered is True
    assert page.reading_order.refs == ("TB1",)

    print_space = next(region for region in page.regions if region.region_type == "print_space")
    text_block = next(region for region in print_space.regions if region.element_id == "TB1")
    assert isinstance(text_block.geometry, Polygon)
    assert len(text_block.geometry.points) == 4

    line = text_block.lines[0]
    assert line.baseline is not None
    assert len(line.baseline.points) == 2
    assert line.text_alternatives[0].text == "hel world-"
    assert line.text_alternatives[0].kind == "reconstructed"

    word = line.words[0]
    assert isinstance(word.geometry, BBox)
    assert word.confidence == pytest.approx(0.95)
    alternatives = {(item.kind, item.text) for item in word.text_alternatives}
    assert ("primary", "hel") in alternatives
    assert ("alternative", "help") in alternatives
    assert ("substitution:HypPart1", "hello") in alternatives
    assert line.source_ref is not None
    assert dict(line.source_ref.attributes)["TAGREFS"] == "TAG1"

    glyph = word.glyphs[0]
    assert glyph.confidence == pytest.approx(0.91)
    assert ("variant", "n") in {(item.kind, item.text) for item in glyph.text_alternatives}


def test_parses_alto_v2_without_schema_version() -> None:
    document = parse_alto_bytes(_fixture("alto_2_1.xml"))

    assert document.source_version == "2.x"
    assert document.pages[0].measurement_unit is MeasurementUnit.MM10
    assert document.pages[0].image_reference == "legacy-v2.tif"
    assert document.processing_steps[0].software_name == "Legacy OCR"
    word = document.pages[0].regions[0].regions[0].lines[0].words[0]
    assert word.text_alternatives[0].text == "legacy"


def test_parses_alto_3_1_polygon_on_string() -> None:
    document = parse_alto_bytes(_fixture("alto_3_1.xml"))
    word = document.pages[0].regions[0].regions[0].lines[0].words[0]

    assert document.source_version == "3.1"
    assert isinstance(word.geometry, Polygon)
    assert [(point.x, point.y) for point in word.geometry.points][:2] == [
        (10.0, 10.0),
        (160.0, 10.0),
    ]


def test_reports_dangling_reading_order_and_idnext_references() -> None:
    document = parse_alto_bytes(_fixture("alto_dangling.xml"))

    dangling = [notice for notice in document.notices if notice.code == "alto.dangling_reference"]
    assert len(dangling) == 2
    assert {notice.source_ref.element_name for notice in dangling if notice.source_ref} == {
        "ElementRef",
        "PrintSpace",
    }


def test_invalid_polygon_falls_back_to_bbox_and_emits_notice() -> None:
    xml = b'''<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#" SCHEMAVERSION="4.4">
      <Description><MeasurementUnit>pixel</MeasurementUnit></Description><Styles/><Layout>
      <Page WIDTH="100" HEIGHT="100"><PrintSpace ID="ps" HPOS="0" VPOS="0" WIDTH="100" HEIGHT="100">
      <TextBlock ID="b" HPOS="1" VPOS="2" WIDTH="3" HEIGHT="4">
      <Shape><Polygon POINTS="1,2 3"/></Shape></TextBlock>
      </PrintSpace></Page></Layout></alto>'''

    document = parse_alto_bytes(xml)
    block = document.pages[0].regions[0].regions[0]

    assert isinstance(block.geometry, BBox)
    assert any(notice.code == "alto.invalid_polygon" for notice in document.notices)


def test_rejects_page_xml_at_alto_adapter_boundary() -> None:
    page_xml = b'<PcGts xmlns="http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15" />'

    with pytest.raises(ALTOParseError, match="Expected ALTO"):
        parse_alto(parse_xml(page_xml))
