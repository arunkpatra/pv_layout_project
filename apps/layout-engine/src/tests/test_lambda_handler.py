"""
Tests for lambda_handler — SQS event parsing and dispatch.
"""
import json
from unittest.mock import MagicMock, patch

import pytest

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


def test_handler_propagates_exception_after_processing_all_records():
    """If handle_layout_job raises on one record, the error is raised after all records are processed."""
    event = {
        "Records": [
            {"body": json.dumps({"version_id": "ver_fail"})},
            {"body": json.dumps({"version_id": "ver_ok"})},
        ]
    }
    with patch("lambda_handler.handle_layout_job", side_effect=[RuntimeError("boom"), None]) as mock_job:
        with pytest.raises(RuntimeError, match="boom"):
            lambda_handler.handler(event, MagicMock())

    # Both records were attempted
    assert mock_job.call_count == 2
    mock_job.assert_any_call("ver_fail")
    mock_job.assert_any_call("ver_ok")
