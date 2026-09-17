from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from xml.etree.ElementTree import Element

from hf_page_viewer.domain import (
    BBox,
    Glyph,
    MeasurementUnit,
    MetadataEntry,
    Page,
    PageDocument,
    ParserNotice,
    Point,
    Polygon,
    Polyline,
    ProcessingStep,
    ReadingOrderGroup,
    Region,
    SourceExtension,
    SourceFormat,
    SourceRef,
    TextAlternative,
    TextLine,
    Word,
)
from hf_page_viewer.parsers.xml import ParsedXML, parse_xml, split_qname

_NUMBER_RE = re.compile(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?")
_PAGE_SPACE_TYPES = {
    "TopMargin": "top_margin",
    "LeftMargin": "left_margin",
    "RightMargin": "right_margin",
    "BottomMargin": "bottom_margin",
    "PrintSpace": "print_space",
}
_BLOCK_TYPES = {
    "TextBlock": "text",
    "ComposedBlock": "composed",
    "Illustration": "illustration",
    "GraphicalElement": "graphical",
}


class ALTOParseError(ValueError):
    code = "alto.parse_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass(slots=True)
class _Context:
    paths: dict[int, str]
    notices: list[ParserNotice]
    all_ids: set[str]
    references: list[tuple[str, str, SourceRef]]

    def path(self, element: Element) -> str:
        return self.paths[id(element)]

    def ref(self, element: Element) -> SourceRef:
        local = _local_name(element)
        return SourceRef.from_attributes(
            element_name=local,
            path=self.path(element),
            xml_id=element.attrib.get("ID") or element.attrib.get("id"),
            attributes={str(key): str(value) for key, value in element.attrib.items()},
        )

    def element_id(self, element: Element) -> str:
        return element.attrib.get("ID") or element.attrib.get("id") or f"anon:{self.path(element)}"

    def notice(self, code: str, message: str, element: Element | None = None) -> None:
        self.notices.append(
            ParserNotice(
                code=code,
                message=message,
                source_ref=self.ref(element) if element is not None else None,
            )
        )


def _local_name(element: Element) -> str:
    return split_qname(element.tag)[1]


def _build_paths(root: Element) -> dict[int, str]:
    paths: dict[int, str] = {}

    def visit(element: Element, path: str) -> None:
        paths[id(element)] = path
        totals = Counter(_local_name(child) for child in element)
        seen: Counter[str] = Counter()
        for child in element:
            local = _local_name(child)
            seen[local] += 1
            suffix = f"[{seen[local]}]" if totals[local] > 1 else ""
            visit(child, f"{path}/{local}{suffix}")

    visit(root, f"/{_local_name(root)}")
    return paths


def _children(element: Element, *names: str) -> Iterable[Element]:
    wanted = set(names)
    return (child for child in element if _local_name(child) in wanted)


def _first_child(element: Element, *names: str) -> Element | None:
    return next(iter(_children(element, *names)), None)


def _descendants(element: Element, *names: str) -> Iterable[Element]:
    wanted = set(names)
    for descendant in element.iter():
        if descendant is not element and _local_name(descendant) in wanted:
            yield descendant


def _first_descendant(element: Element, *names: str) -> Element | None:
    return next(iter(_descendants(element, *names)), None)


def _text(element: Element | None) -> str | None:
    if element is None or element.text is None:
        return None
    text = element.text.strip()
    return text or None


def _float_attribute(
    element: Element,
    name: str,
    context: _Context,
) -> float | None:
    raw = element.attrib.get(name)
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except ValueError:
        context.notice(
            "alto.invalid_number",
            f"Attribute {name}={raw!r} is not numeric",
            element,
        )
        return None


def _confidence(element: Element, name: str, context: _Context) -> float | None:
    value = _float_attribute(element, name, context)
    return value


def _points(
    value: str | None,
    *,
    minimum: int,
    context: _Context,
    element: Element,
    notice_code: str,
) -> tuple[Point, ...] | None:
    if not value:
        return None
    tokens = _NUMBER_RE.findall(value)
    if len(tokens) % 2 != 0:
        context.notice(notice_code, f"Odd number of coordinate values in {value!r}", element)
        return None
    if len(tokens) < minimum * 2:
        context.notice(
            notice_code,
            f"Expected at least {minimum} coordinate pairs in {value!r}",
            element,
        )
        return None
    try:
        return tuple(
            Point(float(tokens[index]), float(tokens[index + 1]))
            for index in range(0, len(tokens), 2)
        )
    except ValueError:
        context.notice(notice_code, f"Invalid coordinate list {value!r}", element)
        return None


def _bbox(element: Element, context: _Context) -> BBox | None:
    names = ("HPOS", "VPOS", "WIDTH", "HEIGHT")
    if not all(name in element.attrib for name in names):
        return None
    values = tuple(_float_attribute(element, name, context) for name in names)
    if any(value is None for value in values):
        return None
    x, y, width, height = values
    assert x is not None and y is not None and width is not None and height is not None
    return BBox(x=x, y=y, width=width, height=height)


def _polygon(element: Element, context: _Context) -> Polygon | None:
    shape = _first_child(element, "Shape")
    if shape is None:
        return None
    polygon = _first_child(shape, "Polygon")
    if polygon is None:
        context.notice(
            "alto.unsupported_shape",
            "Shape is present but no Polygon child could be normalized",
            shape,
        )
        return None
    points = _points(
        polygon.attrib.get("POINTS"),
        minimum=3,
        context=context,
        element=polygon,
        notice_code="alto.invalid_polygon",
    )
    return Polygon(points) if points is not None else None


def _geometry(element: Element, context: _Context) -> BBox | Polygon | None:
    return _polygon(element, context) or _bbox(element, context)


def _baseline(element: Element, context: _Context) -> Polyline | None:
    value = element.attrib.get("BASELINE")
    if not value:
        return None
    points = _points(
        value,
        minimum=2,
        context=context,
        element=element,
        notice_code="alto.invalid_baseline",
    )
    return Polyline(points) if points is not None else None


def _text_alternatives(element: Element, context: _Context) -> tuple[TextAlternative, ...]:
    alternatives: list[TextAlternative] = []
    content = element.attrib.get("CONTENT")
    if content is not None:
        alternatives.append(
            TextAlternative(
                text=content,
                confidence=_confidence(element, "WC", context),
                kind="primary",
            )
        )

    substitution = element.attrib.get("SUBS_CONTENT")
    if substitution is not None:
        substitution_type = element.attrib.get("SUBS_TYPE") or "unknown"
        alternatives.append(
            TextAlternative(
                text=substitution,
                kind=f"substitution:{substitution_type}",
            )
        )

    for child in _children(element, "ALTERNATIVE"):
        value = child.attrib.get("CONTENT") or _text(child)
        if value is not None:
            alternatives.append(TextAlternative(text=value, kind="alternative"))

    return tuple(alternatives)


def _parse_glyph(element: Element, context: _Context) -> Glyph:
    alternatives: list[TextAlternative] = []
    content = element.attrib.get("CONTENT")
    if content is not None:
        alternatives.append(
            TextAlternative(
                content,
                confidence=_confidence(element, "GC", context),
                kind="primary",
            )
        )
    for variant in _children(element, "Variant"):
        value = variant.attrib.get("CONTENT") or _text(variant)
        if value is not None:
            alternatives.append(
                TextAlternative(
                    value,
                    confidence=_confidence(variant, "VC", context),
                    kind="variant",
                )
            )

    return Glyph(
        element_id=context.element_id(element),
        geometry=_geometry(element, context),
        text_alternatives=tuple(alternatives),
        confidence=_confidence(element, "GC", context),
        source_ref=context.ref(element),
    )


def _parse_word(element: Element, context: _Context) -> Word:
    return Word(
        element_id=context.element_id(element),
        geometry=_geometry(element, context),
        text_alternatives=_text_alternatives(element, context),
        confidence=_confidence(element, "WC", context),
        glyphs=tuple(_parse_glyph(child, context) for child in _children(element, "Glyph")),
        source_ref=context.ref(element),
    )


def _reconstruct_line_text(element: Element) -> str | None:
    parts: list[str] = []
    for child in element:
        local = _local_name(child)
        if local == "String":
            parts.append(child.attrib.get("CONTENT", ""))
        elif local == "SP":
            parts.append(" ")
        elif local == "HYP":
            parts.append(child.attrib.get("CONTENT", "-"))
    value = "".join(parts)
    return value if value else None


def _parse_line(element: Element, context: _Context) -> TextLine:
    reconstructed = _reconstruct_line_text(element)
    alternatives = (
        (TextAlternative(reconstructed, kind="reconstructed"),)
        if reconstructed is not None
        else ()
    )
    return TextLine(
        element_id=context.element_id(element),
        geometry=_geometry(element, context),
        baseline=_baseline(element, context),
        text_alternatives=alternatives,
        words=tuple(_parse_word(child, context) for child in _children(element, "String")),
        source_ref=context.ref(element),
    )


def _region_type(local_name: str) -> str:
    if local_name in _PAGE_SPACE_TYPES:
        return _PAGE_SPACE_TYPES[local_name]
    if local_name in _BLOCK_TYPES:
        return _BLOCK_TYPES[local_name]
    if local_name.endswith("Block"):
        stem = local_name[: -len("Block")]
        return f"block:{stem.lower()}" if stem else "block"
    return local_name.lower()


def _parse_region(element: Element, context: _Context) -> Region:
    lines: tuple[TextLine, ...] = ()
    if _local_name(element) == "TextBlock":
        lines = tuple(_parse_line(child, context) for child in _children(element, "TextLine"))

    child_regions = tuple(
        _parse_region(child, context)
        for child in element
        if _local_name(child) in _PAGE_SPACE_TYPES
        or _local_name(child) in _BLOCK_TYPES
        or _local_name(child).endswith("Block")
    )

    return Region(
        element_id=context.element_id(element),
        region_type=_region_type(_local_name(element)),
        geometry=_geometry(element, context),
        lines=lines,
        regions=child_regions,
        source_ref=context.ref(element),
    )


def _parse_reading_order_group(element: Element, context: _Context) -> ReadingOrderGroup:
    ordered = _local_name(element) == "OrderedGroup"
    refs: list[str] = []
    groups: list[ReadingOrderGroup] = []

    for child in element:
        local = _local_name(child)
        if local == "ElementRef":
            ref = child.attrib.get("IDREF")
            if ref:
                refs.append(ref)
                context.references.append(("reading_order", ref, context.ref(child)))
            else:
                context.notice(
                    "alto.missing_reference",
                    "Reading-order ElementRef has no IDREF attribute",
                    child,
                )
        elif local in {"OrderedGroup", "UnorderedGroup"}:
            groups.append(_parse_reading_order_group(child, context))

    return ReadingOrderGroup(
        element_id=element.attrib.get("ID"),
        ordered=ordered,
        refs=tuple(refs),
        groups=tuple(groups),
        source_ref=context.ref(element),
    )


def _parse_reading_order(element: Element, context: _Context) -> ReadingOrderGroup | None:
    groups = [
        _parse_reading_order_group(child, context)
        for child in element
        if _local_name(child) in {"OrderedGroup", "UnorderedGroup"}
    ]
    if not groups:
        context.notice(
            "alto.empty_reading_order",
            "ReadingOrder is present but contains no supported group",
            element,
        )
        return None
    if len(groups) == 1:
        return groups[0]
    return ReadingOrderGroup(
        element_id=element.attrib.get("ID"),
        ordered=False,
        groups=tuple(groups),
        source_ref=context.ref(element),
    )


def _measurement_unit(description: Element | None) -> MeasurementUnit:
    if description is None:
        return MeasurementUnit.UNKNOWN
    element = _first_child(description, "MeasurementUnit")
    value = (_text(element) or "").lower()
    mapping = {
        "pixel": MeasurementUnit.PIXEL,
        "mm10": MeasurementUnit.MM10,
        "inch1200": MeasurementUnit.INCH1200,
    }
    return mapping.get(value, MeasurementUnit.UNKNOWN)


def _source_image_metadata(
    description: Element | None, context: _Context
) -> tuple[list[MetadataEntry], str | None]:
    metadata: list[MetadataEntry] = []
    if description is None:
        return metadata, None

    info = _first_child(description, "sourceImageInformation")
    if info is None:
        return metadata, None

    labels = {
        "fileName": "source_image.file_name",
        "fileIdentifier": "source_image.file_identifier",
        "documentIdentifier": "source_image.document_identifier",
    }
    image_reference: str | None = None
    for child in info:
        local = _local_name(child)
        value = _text(child)
        if value is None:
            continue
        if local in labels:
            metadata.append(MetadataEntry(labels[local], value, context.ref(child)))
        else:
            metadata.append(MetadataEntry(f"source_image.{local}", value, context.ref(child)))
        if local == "fileName":
            image_reference = value

    for key, value in info.attrib.items():
        metadata.append(MetadataEntry(f"source_image.attribute.{key}", value, context.ref(info)))

    return metadata, image_reference


def _processing_steps(description: Element | None, context: _Context) -> list[ProcessingStep]:
    if description is None:
        return []

    steps: list[ProcessingStep] = []
    containers = [
        child for child in description if _local_name(child) in {"OCRProcessing", "Processing"}
    ]
    for container in containers:
        candidates = [
            child
            for child in container
            if _local_name(child) in {"ocrProcessingStep", "processingStep"}
        ]
        if not candidates:
            candidates = [container]

        for step in candidates:
            software = _first_descendant(step, "processingSoftware")
            if software is not None:
                software_name = _text(_first_descendant(software, "softwareName"))
                software_version = _text(_first_descendant(software, "softwareVersion"))
                creator = _text(_first_descendant(software, "softwareCreator"))
            else:
                software_name = None
                software_version = None
                creator = None
            agency = _text(_first_descendant(step, "processingAgency"))
            settings = _text(_first_descendant(step, "processingStepSettings"))
            step_description = _text(_first_descendant(step, "processingStepDescription"))
            processing_type = step.attrib.get("processingStepType")
            extra = {
                key: value
                for key, value in {
                    "software_creator": creator,
                    "processing_agency": agency,
                    "settings": settings,
                    "description": step_description,
                    "processing_step_type": processing_type,
                }.items()
                if value is not None
            }
            steps.append(
                ProcessingStep(
                    identifier=(
                        step.attrib.get("ID")
                        or container.attrib.get("ID")
                        or f"anon:{context.path(step)}"
                    ),
                    software_name=software_name,
                    software_version=software_version,
                    timestamp=_text(_first_descendant(step, "processingDateTime")),
                    attributes=tuple(sorted(extra.items())),
                    source_ref=context.ref(step),
                )
            )
    return steps


def _extensions(root: Element, context: _Context) -> list[SourceExtension]:
    extensions: list[SourceExtension] = []
    for section_name, category in (("Styles", "style"), ("Tags", "tag")):
        section = _first_child(root, section_name)
        if section is None:
            continue
        for child in section:
            extensions.append(
                SourceExtension(
                    category=category,
                    name=_local_name(child),
                    identifier=child.attrib.get("ID"),
                    text=_text(child),
                    attributes=tuple(sorted((str(k), str(v)) for k, v in child.attrib.items())),
                    source_ref=context.ref(child),
                )
            )
    return extensions


def _parse_page(
    element: Element,
    context: _Context,
    *,
    measurement_unit: MeasurementUnit,
    image_reference: str | None,
) -> Page:
    width = _float_attribute(element, "WIDTH", context)
    height = _float_attribute(element, "HEIGHT", context)
    reading_order_element = _first_child(element, "ReadingOrder")
    reading_order = (
        _parse_reading_order(reading_order_element, context)
        if reading_order_element is not None
        else None
    )

    regions = tuple(
        _parse_region(child, context)
        for child in element
        if _local_name(child) in _PAGE_SPACE_TYPES
        or _local_name(child) in _BLOCK_TYPES
        or _local_name(child).endswith("Block")
    )

    return Page(
        element_id=context.element_id(element),
        width=width,
        height=height,
        measurement_unit=measurement_unit,
        image_reference=image_reference,
        language=element.attrib.get("LANG"),
        other_languages=tuple(element.attrib.get("OTHERLANGS", "").split()),
        rotation=_float_attribute(element, "ROTATION", context),
        regions=regions,
        reading_order=reading_order,
        source_ref=context.ref(element),
    )


def _collect_ids_and_refs(root: Element, context: _Context) -> None:
    for element in root.iter():
        xml_id = element.attrib.get("ID") or element.attrib.get("id")
        if xml_id:
            context.all_ids.add(xml_id)
        next_ref = element.attrib.get("IDNEXT")
        if next_ref:
            context.references.append(("idnext", next_ref, context.ref(element)))


def _reference_notices(context: _Context) -> None:
    seen: set[tuple[str, str, str]] = set()
    for relation, target, source_ref in context.references:
        if target in context.all_ids:
            continue
        key = (relation, target, source_ref.path)
        if key in seen:
            continue
        seen.add(key)
        context.notices.append(
            ParserNotice(
                code="alto.dangling_reference",
                message=f"{relation} reference targets unknown ID {target!r}",
                source_ref=source_ref,
            )
        )


def parse_alto(parsed: ParsedXML) -> PageDocument:
    if parsed.detection.source_format is not SourceFormat.ALTO:
        raise ALTOParseError(
            f"Expected ALTO input, received {parsed.detection.source_format.value}"
        )

    root = parsed.root
    context = _Context(
        paths=_build_paths(root),
        notices=[],
        all_ids=set(),
        references=[],
    )
    _collect_ids_and_refs(root, context)

    description = _first_child(root, "Description")
    measurement_unit = _measurement_unit(description)
    if description is not None and measurement_unit is MeasurementUnit.UNKNOWN:
        unit_element = _first_child(description, "MeasurementUnit")
        if unit_element is not None and _text(unit_element):
            context.notice(
                "alto.unknown_measurement_unit",
                f"Unsupported measurement unit {_text(unit_element)!r}",
                unit_element,
            )

    metadata, image_reference = _source_image_metadata(description, context)
    processing_steps = _processing_steps(description, context)

    layout = _first_child(root, "Layout")
    pages: tuple[Page, ...] = ()
    if layout is None:
        context.notice("alto.missing_layout", "ALTO document has no Layout section", root)
    else:
        pages = tuple(
            _parse_page(
                page,
                context,
                measurement_unit=measurement_unit,
                image_reference=image_reference,
            )
            for page in _children(layout, "Page")
        )
        if not pages:
            context.notice("alto.missing_page", "ALTO Layout contains no Page", layout)

    known_root_children = {"Description", "Styles", "Tags", "Layout"}
    for child in root:
        if _local_name(child) not in known_root_children:
            context.notice(
                "alto.unhandled_root_element",
                f"Root child {_local_name(child)!r} is preserved only as a notice",
                child,
            )

    _reference_notices(context)

    return PageDocument(
        source_format=SourceFormat.ALTO,
        source_version=parsed.detection.version,
        namespace=parsed.detection.namespace,
        pages=pages,
        metadata=tuple(metadata),
        processing_steps=tuple(processing_steps),
        extensions=tuple(_extensions(root, context)),
        notices=tuple(context.notices),
        source_attributes=tuple(sorted((str(k), str(v)) for k, v in root.attrib.items())),
    )


def parse_alto_bytes(data: bytes, *, max_bytes: int = 10 * 1024 * 1024) -> PageDocument:
    return parse_alto(parse_xml(data, max_bytes=max_bytes))
