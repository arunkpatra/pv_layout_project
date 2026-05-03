"""Tests for parse-kmz Lambda handler with mocked S3."""
from __future__ import annotations

import os

import boto3
import pytest
from moto import mock_aws

from parse_kmz_lambda import handler as handler_module
from tests.fixtures import (
    garbage_bytes,
    kmz_with_no_boundaries,
    kmz_with_self_intersecting_polygon,
    kmz_with_two_vertex_boundary,
    kmz_with_out_of_range_coords,
)


BUCKET = "solarlayout-test-projects"
KEY = "projects/usr_test/prj_test/kmz/sample.kmz"


@pytest.fixture
def s3_client():
    """A moto-mocked S3 client with the test bucket created. Resets the
    handler's lazy client too so each test gets a fresh boto3 session.
    """
    handler_module._s3_client = None  # reset lazy singleton
    os.environ["AWS_DEFAULT_REGION"] = "ap-south-1"
    with mock_aws():
        client = boto3.client("s3", region_name="ap-south-1")
        client.create_bucket(
            Bucket=BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "ap-south-1"},
        )
        yield client
    handler_module._s3_client = None


def _put(s3_client, bytes_: bytes):
    s3_client.put_object(Bucket=BUCKET, Key=KEY, Body=bytes_)


def _real_kmz_bytes() -> bytes:
    """Read a known-good fixture from pvlayout_core/tests/golden/kmz."""
    from pathlib import Path
    fixtures_dir = (
        Path(__file__).resolve().parents[3]
        / "pvlayout_core"
        / "tests"
        / "golden"
        / "kmz"
    )
    candidates = sorted(fixtures_dir.glob("*.kmz"))
    assert candidates, f"no .kmz fixtures found in {fixtures_dir}"
    return candidates[0].read_bytes()


def test_success_returns_parsed(s3_client):
    _put(s3_client, _real_kmz_bytes())
    result = handler_module.handler({"bucket": BUCKET, "key": KEY}, None)
    assert result["ok"] is True
    assert "parsed" in result
    assert isinstance(result["parsed"]["boundaries"], list)
    assert len(result["parsed"]["boundaries"]) >= 1
    assert "centroid_lat" in result["parsed"]
    assert "centroid_lon" in result["parsed"]


def test_kmz_not_found(s3_client):
    """No object at the requested key."""
    result = handler_module.handler({"bucket": BUCKET, "key": "missing.kmz"}, None)
    assert result["ok"] is False
    assert result["code"] == "KMZ_NOT_FOUND"


def test_garbage_bytes_returns_invalid(s3_client):
    """Text file renamed .kmz."""
    _put(s3_client, garbage_bytes())
    result = handler_module.handler({"bucket": BUCKET, "key": KEY}, None)
    assert result["ok"] is False
    assert result["code"] == "INVALID_KMZ"


def test_kmz_with_no_boundaries_returns_invalid(s3_client):
    """Level-1 validation. pvlayout_core may reject upstream with "no polygon
    features found"; either origin is acceptable per spec C4."""
    _put(s3_client, kmz_with_no_boundaries())
    result = handler_module.handler({"bucket": BUCKET, "key": KEY}, None)
    assert result["ok"] is False
    assert result["code"] == "INVALID_KMZ"
    msg = result["message"].lower()
    assert ("no boundary" in msg) or ("no polygon" in msg)


def test_kmz_with_two_vertex_returns_invalid(s3_client):
    """Level-2 validation."""
    _put(s3_client, kmz_with_two_vertex_boundary())
    result = handler_module.handler({"bucket": BUCKET, "key": KEY}, None)
    assert result["ok"] is False
    assert result["code"] == "INVALID_KMZ"


def test_kmz_with_out_of_range_returns_invalid(s3_client):
    """Level-3 validation. May fail at parse step OR validator depending on
    pvlayout_core behavior; either way must surface INVALID_KMZ."""
    _put(s3_client, kmz_with_out_of_range_coords())
    result = handler_module.handler({"bucket": BUCKET, "key": KEY}, None)
    assert result["ok"] is False
    assert result["code"] == "INVALID_KMZ"


def test_kmz_with_self_intersecting_polygon_succeeds(s3_client):
    """Self-intersecting polygons used to fail at L4; that check was
    dropped post-prod-smoke (real customer KMZs from CAD/KML editors
    routinely have minor topological imperfections that Shapely flags
    but downstream rendering + compute-layout handle fine). Match
    legacy sidecar behavior."""
    _put(s3_client, kmz_with_self_intersecting_polygon())
    result = handler_module.handler({"bucket": BUCKET, "key": KEY}, None)
    assert result["ok"] is True
    assert "parsed" in result


def test_missing_bucket_or_key_returns_internal_error(s3_client):
    result = handler_module.handler({}, None)
    assert result["ok"] is False
    assert result["code"] == "INTERNAL_ERROR"
