from pathlib import Path

from fastapi.testclient import TestClient

from hf_page_viewer.main import app

client = TestClient(app)
FIXTURES = Path(__file__).parent / "fixtures" / "alto"


def test_alto_parse_endpoint_returns_canonical_document() -> None:
    response = client.post(
        "/api/alto/parse",
        content=(FIXTURES / "alto_4_4.xml").read_bytes(),
        headers={"content-type": "application/xml"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_format"] == "alto"
    assert payload["source_version"] == "4.4"
    assert payload["pages"][0]["language"] == "fr"
    assert payload["pages"][0]["rotation"] == 0
    assert payload["pages"][0]["reading_order"]["refs"] == ["TB1"]
    assert payload["extensions"][0]["category"] == "style"


def test_alto_parse_endpoint_rejects_page_xml() -> None:
    response = client.post(
        "/api/alto/parse",
        content=b'<PcGts xmlns="http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15"/>',
        headers={"content-type": "application/xml"},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "alto.parse_error"
