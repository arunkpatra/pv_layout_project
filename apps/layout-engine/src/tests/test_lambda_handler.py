"""
Tests for lambda_handler — SQS event parsing and dispatch.
"""
import json
from unittest.mock import MagicMock, patch

import lambda_handler


def test_handler_calls_handle_layout_job_once_per_record():
    """Each SQS record results in one handle_layout_job call with correct version_id."""
    event = {
        "Records": [
            {"body": json.dumps({"version_id": "ver_abc123"})},
        ]
    }
    with patch("lambda_handler.handle_layout_job") as mock_job:
        lambda_handler.handler(event, MagicMock())

    mock_job.assert_called_once_with("ver_abc123")


def test_handler_processes_multiple_records():
    """Two records → two calls, each with the correct version_id."""
    event = {
        "Records": [
            {"body": json.dumps({"version_id": "ver_aaa"})},
            {"body": json.dumps({"version_id": "ver_bbb"})},
        ]
    }
    with patch("lambda_handler.handle_layout_job") as mock_job:
        lambda_handler.handler(event, MagicMock())

    assert mock_job.call_count == 2
    mock_job.assert_any_call("ver_aaa")
    mock_job.assert_any_call("ver_bbb")
