from __future__ import annotations

from math import inf

import pytest

from hf_page_viewer.api.dto import document_to_dto
from hf_page_viewer.domain import (
    BBox,
    MeasurementUnit,
    Page,
    PageDocument,
    Point,
    Polygon,
    Region,
    SourceFormat,
    SourceRef,
    TextAlternative,
    TextLine,
    Word,
)


def test_point_rejects_non_finite_coordinates() -> None:
    with pytest.raises(ValueError, match="finite"):
        Point(inf, 1)


def test_bbox_keeps_invalid_semantics_for_later_validation() -> None:
    bbox = BBox(x=10, y=20, width=-5, height=0)

    assert bbox.right == 5
    assert bbox.bottom == 20
    assert bbox.is_degenerate is True


def test_polygon_requires_three_points() -> None:
    with pytest.raises(ValueError, match="three"):
        Polygon((Point(0, 0), Point(1, 1)))


def test_source_ref_attributes_are_stably_sorted() -> None:
    ref = SourceRef.from_attributes(
        element_name="String",
        path="/alto/Layout/Page/TextBlock/TextLine/String[1]",
        xml_id="w1",
        attributes={"VPOS": "20", "HPOS": "10"},
    )

    assert ref.attributes == (("HPOS", "10"), ("VPOS", "20"))


@pytest.mark.parametrize(
    ("source_format", "namespace", "version"),
    [
        (SourceFormat.ALTO, "http://www.loc.gov/standards/alto/ns-v4#", "4.4"),
        (
            SourceFormat.PAGE_XML,
            "http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15",
            "2019-07-15",
        ),
    ],
)
def test_page_document_serializes_through_explicit_dto_mapper(
    source_format: SourceFormat, namespace: str, version: str
) -> None:
    word_ref = SourceRef.from_attributes(
        element_name="String" if source_format is SourceFormat.ALTO else "Word",
        path="/root/page/region/line/word[1]",
        xml_id="w1",
        attributes={"CONTENT": "bonjour"},
    )
    word = Word(
        element_id="w1",
        geometry=BBox(10, 20, 30, 12),
        text_alternatives=(TextAlternative("bonjour", 0.98),),
        source_ref=word_ref,
    )
    line = TextLine(element_id="l1", words=(word,))
    region = Region(element_id="r1", region_type="text", lines=(line,))
    page = Page(
        element_id="p1",
        width=1000,
        height=1500,
        measurement_unit=MeasurementUnit.PIXEL,
        regions=(region,),
    )
    document = PageDocument(
        source_format=source_format,
        source_version=version,
        namespace=namespace,
        pages=(page,),
    )

    payload = document_to_dto(document)

    assert payload["source_format"] == source_format.value
    assert payload["pages"][0]["regions"][0]["lines"][0]["words"][0]["element_id"] == "w1"
    assert payload["pages"][0]["regions"][0]["lines"][0]["words"][0]["source_ref"][
        "attributes"
    ] == {"CONTENT": "bonjour"}
