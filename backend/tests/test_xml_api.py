from fastapi.testclient import TestClient

from hf_page_viewer.main import app

client = TestClient(app)


def test_xml_detection_endpoint() -> None:
    response = client.post(
        "/api/xml/detect",
        content=(
            b'<alto xmlns="http://www.loc.gov/standards/alto/ns-v4#" '
            b'SCHEMAVERSION="4.4"/>'
        ),
        headers={"content-type": "application/xml"},
    )

    assert response.status_code == 200
    assert response.json()["source_format"] == "alto"
    assert response.json()["version"] == "4.4"


def test_xml_detection_endpoint_returns_structured_malformed_error() -> None:
    response = client.post(
        "/api/xml/detect",
        content=b"<alto>",
        headers={"content-type": "application/xml"},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "xml.malformed"


def test_xml_detection_endpoint_returns_structured_unsupported_error() -> None:
    response = client.post(
        "/api/xml/detect",
        content=b'<foo xmlns="urn:example"/>',
        headers={"content-type": "application/xml"},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "xml.unsupported_format"
