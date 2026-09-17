from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum
from xml.etree.ElementTree import Element, ParseError

from defusedxml import ElementTree as DefusedET
from defusedxml.common import DTDForbidden, EntitiesForbidden, ExternalReferenceForbidden

from hf_page_viewer.domain import SourceFormat, SourceRef

XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
ALTO_NAMESPACE_RE = re.compile(
    r"^https?://www\.loc\.gov/standards/alto/ns-v(?P<major>\d+)#$"
)
PAGE_NAMESPACE_RE = re.compile(
    r"^https?://schema\.primaresearch\.org/PAGE/gts/pagecontent/"
    r"(?P<version>\d{4}-\d{2}-\d{2})$"
)
XML_DECL_ENCODING_RE = re.compile(
    br"""<\?xml[^>]*\bencoding\s*=\s*["'](?P<encoding>[^"']+)["']""",
    re.IGNORECASE,
)

KNOWN_ALTO_VERSIONS = frozenset(
    {"2.0", "2.1", "3.0", "3.1", "4.0", "4.1", "4.2", "4.3", "4.4"}
)
KNOWN_ALTO_MAJOR_FAMILIES = frozenset({2, 3, 4})
KNOWN_PAGE_VERSIONS = frozenset({"2019-07-15"})


class VersionSource(StrEnum):
    ROOT_ATTRIBUTE = "root_attribute"
    NAMESPACE = "namespace"


@dataclass(frozen=True, slots=True)
class XMLDetectionResult:
    source_format: SourceFormat
    namespace: str
    version: str
    version_source: VersionSource
    known_version: bool
    root_name: str
    schema_location: str | None
    declared_encoding: str | None
    source_ref: SourceRef

    def to_dict(self) -> dict[str, object]:
        return {
            "source_format": self.source_format.value,
            "namespace": self.namespace,
            "version": self.version,
            "version_source": self.version_source.value,
            "known_version": self.known_version,
            "root_name": self.root_name,
            "schema_location": self.schema_location,
            "declared_encoding": self.declared_encoding,
            "source_ref": {
                "element_name": self.source_ref.element_name,
                "path": self.source_ref.path,
                "xml_id": self.source_ref.xml_id,
                "attributes": dict(self.source_ref.attributes),
            },
        }


@dataclass(frozen=True, slots=True)
class ParsedXML:
    root: Element
    detection: XMLDetectionResult
    byte_size: int


class XMLInputError(ValueError):
    code = "xml.input_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class XMLTooLargeError(XMLInputError):
    code = "xml.too_large"

    def __init__(self, size: int, limit: int) -> None:
        super().__init__(f"XML payload is {size} bytes; limit is {limit} bytes")
        self.size = size
        self.limit = limit


class XMLSecurityError(XMLInputError):
    code = "xml.unsafe_construct"


class MalformedXMLError(XMLInputError):
    code = "xml.malformed"


class UnsupportedXMLFormatError(XMLInputError):
    code = "xml.unsupported_format"


def split_qname(tag: str) -> tuple[str | None, str]:
    if tag.startswith("{") and "}" in tag:
        namespace, local_name = tag[1:].split("}", 1)
        return namespace, local_name
    return None, tag


def _declared_encoding(data: bytes) -> str | None:
    match = XML_DECL_ENCODING_RE.search(data[:256])
    if not match:
        return None
    return match.group("encoding").decode("ascii", errors="replace")


def _schema_location(root: Element, namespace: str) -> str | None:
    schema_location = root.attrib.get(f"{{{XSI_NS}}}schemaLocation")
    if schema_location:
        tokens = schema_location.split()
        for index in range(0, len(tokens) - 1, 2):
            if tokens[index] == namespace:
                return tokens[index + 1]

    return root.attrib.get(f"{{{XSI_NS}}}noNamespaceSchemaLocation")


def _source_ref(root: Element, local_name: str) -> SourceRef:
    return SourceRef.from_attributes(
        element_name=local_name,
        path=f"/{local_name}",
        xml_id=root.attrib.get("ID") or root.attrib.get("id"),
        attributes={str(key): str(value) for key, value in root.attrib.items()},
    )


def detect_xml_format(root: Element, *, data: bytes) -> XMLDetectionResult:
    namespace, local_name = split_qname(root.tag)
    if not namespace:
        raise UnsupportedXMLFormatError(
            f"Root element {local_name!r} has no supported namespace"
        )

    if local_name == "alto":
        match = ALTO_NAMESPACE_RE.fullmatch(namespace)
        if not match:
            raise UnsupportedXMLFormatError(
                f"ALTO-like root uses unsupported namespace {namespace!r}"
            )

        major = int(match.group("major"))
        declared = root.attrib.get("SCHEMAVERSION")
        version = declared or f"{major}.x"
        return XMLDetectionResult(
            source_format=SourceFormat.ALTO,
            namespace=namespace,
            version=version,
            version_source=(
                VersionSource.ROOT_ATTRIBUTE if declared else VersionSource.NAMESPACE
            ),
            known_version=(
                declared in KNOWN_ALTO_VERSIONS
                if declared
                else major in KNOWN_ALTO_MAJOR_FAMILIES
            ),
            root_name=local_name,
            schema_location=_schema_location(root, namespace),
            declared_encoding=_declared_encoding(data),
            source_ref=_source_ref(root, local_name),
        )

    if local_name == "PcGts":
        match = PAGE_NAMESPACE_RE.fullmatch(namespace)
        if not match:
            raise UnsupportedXMLFormatError(
                f"PAGE-like root uses unsupported namespace {namespace!r}"
            )

        version = match.group("version")
        return XMLDetectionResult(
            source_format=SourceFormat.PAGE_XML,
            namespace=namespace,
            version=version,
            version_source=VersionSource.NAMESPACE,
            known_version=version in KNOWN_PAGE_VERSIONS,
            root_name=local_name,
            schema_location=_schema_location(root, namespace),
            declared_encoding=_declared_encoding(data),
            source_ref=_source_ref(root, local_name),
        )

    raise UnsupportedXMLFormatError(
        f"Unsupported XML root element {local_name!r} in namespace {namespace!r}"
    )


def parse_xml(data: bytes, *, max_bytes: int = 10 * 1024 * 1024) -> ParsedXML:
    if len(data) > max_bytes:
        raise XMLTooLargeError(len(data), max_bytes)

    if not data.strip():
        raise MalformedXMLError("XML payload is empty")

    try:
        root = DefusedET.fromstring(
            data,
            forbid_dtd=True,
            forbid_entities=True,
            forbid_external=True,
        )
    except (DTDForbidden, EntitiesForbidden, ExternalReferenceForbidden) as exc:
        raise XMLSecurityError(f"Unsafe XML construct rejected: {type(exc).__name__}") from exc
    except ParseError as exc:
        raise MalformedXMLError(f"Malformed XML: {exc}") from exc

    detection = detect_xml_format(root, data=data)
    return ParsedXML(root=root, detection=detection, byte_size=len(data))
