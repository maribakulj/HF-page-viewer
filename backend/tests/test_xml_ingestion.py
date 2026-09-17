from __future__ import annotations

import pytest

from hf_page_viewer.domain import SourceFormat
from hf_page_viewer.parsers.xml import (
    MalformedXMLError,
    UnsupportedXMLFormatError,
    VersionSource,
    XMLSecurityError,
    XMLTooLargeError,
    parse_xml,
)


@pytest.mark.parametrize(
    ("namespace", "schema_version", "expected_version"),
    [
        ("http://www.loc.gov/standards/alto/ns-v2#", None, "2.x"),
        ("http://www.loc.gov/standards/alto/ns-v3#", "3.1", "3.1"),
        ("http://www.loc.gov/standards/alto/ns-v4#", "4.4", "4.4"),
    ],
)
def test_detects_supported_alto_families(
    namespace: str, schema_version: str | None, expected_version: str
) -> None:
    version_attribute = (
        f' SCHEMAVERSION="{schema_version}"' if schema_version is not None else ""
    )
    xml = (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f'<alto xmlns="{namespace}"{version_attribute}></alto>'
    ).encode()

    result = parse_xml(xml).detection

    assert result.source_format is SourceFormat.ALTO
    assert result.version == expected_version
    assert result.known_version is True
    assert result.version_source is (
        VersionSource.ROOT_ATTRIBUTE if schema_version else VersionSource.NAMESPACE
    )
    assert result.declared_encoding == "UTF-8"


def test_detects_alto_schema_location_without_fetching_it() -> None:
    namespace = "http://www.loc.gov/standards/alto/ns-v4#"
    xml = f"""<alto
        xmlns="{namespace}"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        SCHEMAVERSION="4.4"
        xsi:schemaLocation="{namespace} https://example.invalid/alto.xsd"
    />""".encode()

    result = parse_xml(xml).detection

    assert result.schema_location == "https://example.invalid/alto.xsd"


def test_detects_page_2019() -> None:
    namespace = "http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15"
    xml = f'<PcGts xmlns="{namespace}"><Page imageWidth="1" imageHeight="1"/></PcGts>'.encode()

    result = parse_xml(xml).detection

    assert result.source_format is SourceFormat.PAGE_XML
    assert result.version == "2019-07-15"
    assert result.known_version is True


def test_recognizes_future_page_namespace_without_claiming_support() -> None:
    namespace = "http://schema.primaresearch.org/PAGE/gts/pagecontent/2030-01-01"
    result = parse_xml(f'<PcGts xmlns="{namespace}"/>'.encode()).detection

    assert result.source_format is SourceFormat.PAGE_XML
    assert result.version == "2030-01-01"
    assert result.known_version is False


@pytest.mark.parametrize(
    "payload",
    [
        b'<!DOCTYPE alto [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
        b'<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#">&xxe;</alto>',
        b'<!DOCTYPE alto [<!ENTITY a "123">]>'
        b'<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#">&a;</alto>',
        b'<!DOCTYPE alto SYSTEM "https://example.invalid/external.dtd">'
        b'<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#"/>',
    ],
)
def test_rejects_dtd_entities_and_external_references(payload: bytes) -> None:
    with pytest.raises(XMLSecurityError):
        parse_xml(payload)


def test_rejects_malformed_xml() -> None:
    with pytest.raises(MalformedXMLError):
        parse_xml(b"<alto>")


def test_rejects_unknown_root() -> None:
    with pytest.raises(UnsupportedXMLFormatError):
        parse_xml(b'<foo xmlns="urn:example"/>')


def test_rejects_alto_like_root_in_non_official_namespace() -> None:
    with pytest.raises(UnsupportedXMLFormatError):
        parse_xml(b'<alto xmlns="urn:alto-ish"/>')


def test_enforces_size_limit_before_parsing() -> None:
    with pytest.raises(XMLTooLargeError) as caught:
        parse_xml(b"<x/>", max_bytes=3)

    assert caught.value.size == 4
    assert caught.value.limit == 3
