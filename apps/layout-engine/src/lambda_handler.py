"""Lambda entrypoint for SQS-triggered layout jobs.

Each SQS record body is a JSON object: {"version_id": "ver_..."}
One record per invocation (batch size = 1 on the event source mapping).
"""
import json
import logging
import time

from handlers import handle_layout_job

logger = logging.getLogger("layout_engine")
logger.setLevel(logging.INFO)


def handler(event, context):
    records = event["Records"]
    if len(records) != 1:
        raise RuntimeError(f"Expected batch size 1, got {len(records)}")
    try:
        payload = json.loads(records[0]["body"])
        version_id = payload["version_id"]
        logger.info("START version_id=%s", version_id)
        t0 = time.monotonic()
        handle_layout_job(version_id)
        elapsed = time.monotonic() - t0
        logger.info("DONE version_id=%s elapsed=%.1fs", version_id, elapsed)
    except Exception as exc:
        logger.error("FAILED version_id=%s error=%s", payload.get("version_id", "?"), exc)
        raise
