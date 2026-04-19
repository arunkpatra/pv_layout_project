"""Lambda entrypoint for SQS-triggered layout jobs.

Each SQS record body is a JSON object: {"version_id": "ver_..."}
One record per invocation (batch size = 1 on the event source mapping).
"""
import json

from handlers import handle_layout_job


def handler(event, context):
    errors = []
    for record in event["Records"]:
        try:
            payload = json.loads(record["body"])
            handle_layout_job(payload["version_id"])
        except Exception as exc:
            print(f"Failed to process record: {exc}")
            errors.append(exc)
    if errors:
        raise errors[0]
