from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from math import isfinite


class SourceFormat(StrEnum):
    ALTO = "alto"
    PAGE_XML = "page_xml"


class MeasurementUnit(StrEnum):
    PIXEL = "pixel"
    MM10 = "mm10"
    INCH1200 = "inch1200"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class Point:
    x: float
    y: float

    def __post_init__(self) -> None:
        if not isfinite(self.x) or not isfinite(self.y):
            raise ValueError("Point coordinates must be finite")


@dataclass(frozen=True, slots=True)
class BBox:
    x: float
    y: float
    width: float
    height: float

    def __post_init__(self) -> None:
        if not all(isfinite(value) for value in (self.x, self.y, self.width, self.height)):
            raise ValueError("Bounding-box values must be finite")

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def bottom(self) -> float:
        return self.y + self.height

    @property
    def is_degenerate(self) -> bool:
        return self.width <= 0 or self.height <= 0


@dataclass(frozen=True, slots=True)
class Polygon:
    points: tuple[Point, ...]

    def __post_init__(self) -> None:
        if len(self.points) < 3:
            raise ValueError("A polygon requires at least three points")


@dataclass(frozen=True, slots=True)
class Polyline:
    points: tuple[Point, ...]

    def __post_init__(self) -> None:
        if len(self.points) < 2:
            raise ValueError("A polyline requires at least two points")


Geometry = BBox | Polygon


@dataclass(frozen=True, slots=True)
class SourceRef:
    element_name: str
    path: str
    xml_id: str | None = None
    attributes: tuple[tuple[str, str], ...] = ()

    @classmethod
    def from_attributes(
        cls,
        *,
        element_name: str,
        path: str,
        xml_id: str | None = None,
        attributes: Mapping[str, str] | None = None,
    ) -> SourceRef:
        return cls(
            element_name=element_name,
            path=path,
            xml_id=xml_id,
            attributes=tuple(sorted((attributes or {}).items())),
        )


@dataclass(frozen=True, slots=True)
class TextAlternative:
    text: str
    confidence: float | None = None
    kind: str = "primary"


@dataclass(frozen=True, slots=True)
class MetadataEntry:
    label: str
    value: str
    source_ref: SourceRef | None = None


@dataclass(frozen=True, slots=True)
class ProcessingStep:
    identifier: str | None = None
    software_name: str | None = None
    software_version: str | None = None
    timestamp: str | None = None
    attributes: tuple[tuple[str, str], ...] = ()
    source_ref: SourceRef | None = None


@dataclass(frozen=True, slots=True)
class SourceExtension:
    category: str
    name: str
    identifier: str | None = None
    text: str | None = None
    attributes: tuple[tuple[str, str], ...] = ()
    source_ref: SourceRef | None = None


@dataclass(frozen=True, slots=True)
class ParserNotice:
    code: str
    message: str
    source_ref: SourceRef | None = None


@dataclass(frozen=True, slots=True)
class Glyph:
    element_id: str
    geometry: Geometry | None = None
    text_alternatives: tuple[TextAlternative, ...] = ()
    confidence: float | None = None
    source_ref: SourceRef | None = None


@dataclass(frozen=True, slots=True)
class Word:
    element_id: str
    geometry: Geometry | None = None
    text_alternatives: tuple[TextAlternative, ...] = ()
    confidence: float | None = None
    glyphs: tuple[Glyph, ...] = ()
    source_ref: SourceRef | None = None


@dataclass(frozen=True, slots=True)
class TextLine:
    element_id: str
    geometry: Geometry | None = None
    baseline: Polyline | None = None
    text_alternatives: tuple[TextAlternative, ...] = ()
    words: tuple[Word, ...] = ()
    source_ref: SourceRef | None = None


@dataclass(frozen=True, slots=True)
class Region:
    element_id: str
    region_type: str
    geometry: Geometry | None = None
    text_alternatives: tuple[TextAlternative, ...] = ()
    lines: tuple[TextLine, ...] = ()
    regions: tuple[Region, ...] = ()
    source_ref: SourceRef | None = None


@dataclass(frozen=True, slots=True)
class ReadingOrderGroup:
    element_id: str | None = None
    ordered: bool = True
    refs: tuple[str, ...] = ()
    groups: tuple[ReadingOrderGroup, ...] = ()
    source_ref: SourceRef | None = None


@dataclass(frozen=True, slots=True)
class Page:
    element_id: str
    width: float | None = None
    height: float | None = None
    measurement_unit: MeasurementUnit = MeasurementUnit.UNKNOWN
    image_reference: str | None = None
    language: str | None = None
    other_languages: tuple[str, ...] = ()
    rotation: float | None = None
    regions: tuple[Region, ...] = ()
    reading_order: ReadingOrderGroup | None = None
    source_ref: SourceRef | None = None


@dataclass(frozen=True, slots=True)
class PageDocument:
    source_format: SourceFormat
    source_version: str | None
    namespace: str | None
    pages: tuple[Page, ...]
    metadata: tuple[MetadataEntry, ...] = ()
    processing_steps: tuple[ProcessingStep, ...] = ()
    extensions: tuple[SourceExtension, ...] = ()
    notices: tuple[ParserNotice, ...] = ()
    source_attributes: tuple[tuple[str, str], ...] = field(default_factory=tuple)
