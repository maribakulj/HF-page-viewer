from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from hf_page_viewer.api.dto import document_to_dto
from hf_page_viewer.api.xml import MAX_XML_UPLOAD_BYTES, read_limited_body, raise_xml_http_error
from hf_page_viewer.parsers.alto import ALTOParseError, parse_alto
from hf_page_viewer.parsers.xml import XMLInputError, parse_xml

router = APIRouter(prefix="/api/alto", tags=["alto"])


@router.post("/parse")
async def parse_alto_endpoint(request: Request) -> dict[str, object]:
    """Parse untrusted ALTO XML into the canonical PageDocument DTO."""

    try:
        data = await read_limited_body(request)
        parsed_xml = parse_xml(data, max_bytes=MAX_XML_UPLOAD_BYTES)
    except XMLInputError as exc:
        raise_xml_http_error(exc)

    try:
        document = parse_alto(parsed_xml)
    except ALTOParseError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    return document_to_dto(document)
