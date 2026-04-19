"""Lambda entrypoint for SQS-triggered layout jobs.

Each SQS record body is a JSON object: {"version_id": "ver_..."}
One record per invocation (batch size = 1 on the event source mapping).
"""
import json

from handlers import handle_layout_job


def handler(event, context):
    records = event["Records"]
    if len(records) != 1:
        raise RuntimeError(f"Expected batch size 1, got {len(records)}")
    try:
        payload = json.loads(records[0]["body"])
        handle_layout_job(payload["version_id"])
    except Exception as exc:
        print(f"Failed to process record: {exc}")
        raise
