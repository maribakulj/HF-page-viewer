from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from hf_page_viewer.parsers.xml import (
    MalformedXMLError,
    UnsupportedXMLFormatError,
    XMLSecurityError,
    XMLTooLargeError,
    parse_xml,
)

router = APIRouter(prefix="/api/xml", tags=["xml"])
MAX_XML_UPLOAD_BYTES = 10 * 1024 * 1024


async def read_limited_body(request: Request, *, limit: int = MAX_XML_UPLOAD_BYTES) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            declared_size = int(content_length)
        except ValueError:
            declared_size = None
        if declared_size is not None and declared_size > limit:
            raise XMLTooLargeError(declared_size, limit)

    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise XMLTooLargeError(size, limit)
        chunks.append(chunk)
    return b"".join(chunks)


def _raise_http_error(exc: Exception) -> None:
    if isinstance(exc, XMLTooLargeError):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    if isinstance(exc, (MalformedXMLError, XMLSecurityError)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    if isinstance(exc, UnsupportedXMLFormatError):
        raise HTTPException(
            status_code=422,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    raise exc


@router.post("/detect")
async def detect_xml(request: Request) -> dict[str, object]:
    """Safely parse enough XML to identify its page-layout format and version."""

    try:
        data = await read_limited_body(request)
        parsed = parse_xml(data, max_bytes=MAX_XML_UPLOAD_BYTES)
    except (
        XMLTooLargeError,
        MalformedXMLError,
        XMLSecurityError,
        UnsupportedXMLFormatError,
    ) as exc:
        _raise_http_error(exc)
        raise AssertionError("unreachable")

    return {
        **parsed.detection.to_dict(),
        "byte_size": parsed.byte_size,
    }
