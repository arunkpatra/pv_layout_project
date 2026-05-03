"""parse-kmz Lambda handler.

Event shape (sync invoke from mvp_api):
  {"bucket": "<s3-bucket>", "key": "<s3-key-to-kmz>"}

Response shape (per spec C4 brainstorm Q3):
  {"ok": True, "parsed": {<ParsedKmz wire shape>}}
  {"ok": False, "code": "KMZ_NOT_FOUND",  "message": "...", "key": "..."}
  {"ok": False, "code": "INVALID_KMZ",    "message": "...", "trace": "..."}
  {"ok": False, "code": "INTERNAL_ERROR", "message": "...", "trace": "..."}

Local dev: server.py exposes POST /invoke that calls this handler with
the request body as the event. Per C3.5 D24 + journium-bip-pipeline pattern.
"""
from __future__ import annotations

import logging
import sys
import tempfile
import traceback
from pathlib import Path
from typing import Any

import boto3
from botocore.exceptions import ClientError

from parse_kmz_lambda.validator import ValidationError, validate_parsed_kmz

logging.basicConfig(stream=sys.stdout, level=logging.INFO)
logger = logging.getLogger(__name__)

_s3_client: Any = None


def _get_s3_client() -> Any:
    """Lazy boto3 client (faster cold start; handler can be tested with mock)."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3")
    return _s3_client


def _parsed_to_wire(parsed: Any) -> dict[str, Any]:
    """Translate pvlayout_core's ParsedKMZ-equivalent object to wire JSON.

    Mirrors the sidecar's parse_kmz route response (per spec C4
    brainstorm). The wire shape is the same one entitlements-client's
    ParsedKmz Zod schema validates.
    """
    return {
        "boundaries": [
            {
                "name": b.name,
                "coords": [(lon, lat) for (lon, lat) in b.coords],
                "obstacles": [
                    [(lon, lat) for (lon, lat) in obs] for obs in b.obstacles
                ],
                "water_obstacles": [
                    [(lon, lat) for (lon, lat) in wo]
                    for wo in getattr(b, "water_obstacles", [])
                ],
                "line_obstructions": [
                    [(lon, lat) for (lon, lat) in line]
                    for line in b.line_obstructions
                ],
            }
            for b in parsed.boundaries
        ],
        "centroid_lat": parsed.centroid_lat,
        "centroid_lon": parsed.centroid_lon,
    }


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    """parse-kmz Lambda entry point.

    Accepts {bucket, key}; returns the structured success-or-error envelope.
    """
    from pvlayout_core.core.kmz_parser import parse_kmz as core_parse_kmz

    bucket = event.get("bucket")
    key = event.get("key")
    if not bucket or not key:
        return {
            "ok": False,
            "code": "INTERNAL_ERROR",
            "message": "event missing bucket or key",
        }

    s3 = _get_s3_client()

    # Step 1: fetch from S3.
    try:
        s3_response = s3.get_object(Bucket=bucket, Key=key)
        kmz_bytes = s3_response["Body"].read()
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("NoSuchKey", "404"):
            return {
                "ok": False,
                "code": "KMZ_NOT_FOUND",
                "message": f"KMZ not found at s3://{bucket}/{key}",
                "key": key,
            }
        logger.exception("s3:GetObject failed for %s/%s", bucket, key)
        return {
            "ok": False,
            "code": "INTERNAL_ERROR",
            "message": f"s3:GetObject failed: {code}",
            "trace": traceback.format_exc(),
        }
    except Exception:
        logger.exception("unexpected error fetching s3://%s/%s", bucket, key)
        return {
            "ok": False,
            "code": "INTERNAL_ERROR",
            "message": "unexpected S3 fetch failure",
            "trace": traceback.format_exc(),
        }

    # Step 2: spill to disk + parse.
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir) / "input.kmz"
        tmp_path.write_bytes(kmz_bytes)
        try:
            parsed = core_parse_kmz(str(tmp_path))
        except Exception as exc:
            logger.warning("pvlayout_core.parse_kmz raised: %s", exc)
            return {
                "ok": False,
                "code": "INVALID_KMZ",
                "message": f"could not parse KMZ: {exc}",
                "trace": traceback.format_exc(),
            }

    # Step 3: domain validation (levels 1-4).
    try:
        validate_parsed_kmz(parsed)
    except ValidationError as exc:
        return {
            "ok": False,
            "code": "INVALID_KMZ",
            "message": str(exc),
        }

    # Step 4: success.
    return {
        "ok": True,
        "parsed": _parsed_to_wire(parsed),
    }
