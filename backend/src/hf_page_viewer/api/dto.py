from __future__ import annotations

from typing import Any

from hf_page_viewer.domain import (
    BBox,
    Glyph,
    Page,
    PageDocument,
    Polygon,
    Polyline,
    ReadingOrderGroup,
    Region,
    SourceRef,
    TextAlternative,
    TextLine,
    Word,
)


def source_ref_to_dto(source_ref: SourceRef | None) -> dict[str, Any] | None:
    if source_ref is None:
        return None
    return {
        "element_name": source_ref.element_name,
        "path": source_ref.path,
        "xml_id": source_ref.xml_id,
        "attributes": dict(source_ref.attributes),
    }


def geometry_to_dto(geometry: BBox | Polygon | None) -> dict[str, Any] | None:
    if geometry is None:
        return None
    if isinstance(geometry, BBox):
        return {
            "kind": "bbox",
            "x": geometry.x,
            "y": geometry.y,
            "width": geometry.width,
            "height": geometry.height,
        }
    return {
        "kind": "polygon",
        "points": [{"x": point.x, "y": point.y} for point in geometry.points],
    }


def polyline_to_dto(polyline: Polyline | None) -> dict[str, Any] | None:
    if polyline is None:
        return None
    return {
        "kind": "polyline",
        "points": [{"x": point.x, "y": point.y} for point in polyline.points],
    }


def _alternatives_to_dto(items: tuple[TextAlternative, ...]) -> list[dict[str, Any]]:
    return [{"text": item.text, "confidence": item.confidence} for item in items]


def glyph_to_dto(glyph: Glyph) -> dict[str, Any]:
    return {
        "element_id": glyph.element_id,
        "geometry": geometry_to_dto(glyph.geometry),
        "text_alternatives": _alternatives_to_dto(glyph.text_alternatives),
        "confidence": glyph.confidence,
        "source_ref": source_ref_to_dto(glyph.source_ref),
    }


def word_to_dto(word: Word) -> dict[str, Any]:
    return {
        "element_id": word.element_id,
        "geometry": geometry_to_dto(word.geometry),
        "text_alternatives": _alternatives_to_dto(word.text_alternatives),
        "confidence": word.confidence,
        "glyphs": [glyph_to_dto(glyph) for glyph in word.glyphs],
        "source_ref": source_ref_to_dto(word.source_ref),
    }


def line_to_dto(line: TextLine) -> dict[str, Any]:
    return {
        "element_id": line.element_id,
        "geometry": geometry_to_dto(line.geometry),
        "baseline": polyline_to_dto(line.baseline),
        "text_alternatives": _alternatives_to_dto(line.text_alternatives),
        "words": [word_to_dto(word) for word in line.words],
        "source_ref": source_ref_to_dto(line.source_ref),
    }


def region_to_dto(region: Region) -> dict[str, Any]:
    return {
        "element_id": region.element_id,
        "region_type": region.region_type,
        "geometry": geometry_to_dto(region.geometry),
        "text_alternatives": _alternatives_to_dto(region.text_alternatives),
        "lines": [line_to_dto(line) for line in region.lines],
        "regions": [region_to_dto(child) for child in region.regions],
        "source_ref": source_ref_to_dto(region.source_ref),
    }


def _reading_order_to_dto(group: ReadingOrderGroup | None) -> dict[str, Any] | None:
    if group is None:
        return None
    return {
        "element_id": group.element_id,
        "ordered": group.ordered,
        "refs": list(group.refs),
        "groups": [_reading_order_to_dto(child) for child in group.groups],
        "source_ref": source_ref_to_dto(group.source_ref),
    }


def page_to_dto(page: Page) -> dict[str, Any]:
    return {
        "element_id": page.element_id,
        "width": page.width,
        "height": page.height,
        "measurement_unit": page.measurement_unit.value,
        "image_reference": page.image_reference,
        "regions": [region_to_dto(region) for region in page.regions],
        "reading_order": _reading_order_to_dto(page.reading_order),
        "source_ref": source_ref_to_dto(page.source_ref),
    }


def document_to_dto(document: PageDocument) -> dict[str, Any]:
    return {
        "source_format": document.source_format.value,
        "source_version": document.source_version,
        "namespace": document.namespace,
        "pages": [page_to_dto(page) for page in document.pages],
        "metadata": [
            {
                "label": item.label,
                "value": item.value,
                "source_ref": source_ref_to_dto(item.source_ref),
            }
            for item in document.metadata
        ],
        "processing_steps": [
            {
                "identifier": step.identifier,
                "software_name": step.software_name,
                "software_version": step.software_version,
                "timestamp": step.timestamp,
                "attributes": dict(step.attributes),
                "source_ref": source_ref_to_dto(step.source_ref),
            }
            for step in document.processing_steps
        ],
        "notices": [
            {
                "code": notice.code,
                "message": notice.message,
                "source_ref": source_ref_to_dto(notice.source_ref),
            }
            for notice in document.notices
        ],
        "source_attributes": dict(document.source_attributes),
    }
