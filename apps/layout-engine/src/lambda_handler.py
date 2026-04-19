"""Lambda entrypoint for SQS-triggered layout jobs.

Each SQS record body is a JSON object: {"version_id": "ver_..."}
One record per invocation (batch size = 1 on the event source mapping).
"""
import json

from handlers import handle_layout_job


def handler(event, context):
    for record in event["Records"]:
        payload = json.loads(record["body"])
        handle_layout_job(payload["version_id"])
