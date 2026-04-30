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


def test_handler_raises_if_batch_size_exceeds_one():
    """Batch size > 1 is a misconfiguration — handler raises immediately."""
    event = {
        "Records": [
            {"body": json.dumps({"version_id": "ver_aaa"})},
            {"body": json.dumps({"version_id": "ver_bbb"})},
        ]
    }
    with patch("lambda_handler.handle_layout_job") as mock_job:
        with pytest.raises(RuntimeError, match="Expected batch size 1"):
            lambda_handler.handler(event, MagicMock())

    mock_job.assert_not_called()


def test_handler_propagates_exception_from_handle_layout_job():
    """If handle_layout_job raises, the exception propagates out of the handler."""
    event = {
        "Records": [
            {"body": json.dumps({"version_id": "ver_fail"})},
        ]
    }
    with patch("lambda_handler.handle_layout_job", side_effect=RuntimeError("boom")) as mock_job:
        with pytest.raises(RuntimeError, match="boom"):
            lambda_handler.handler(event, MagicMock())

    mock_job.assert_called_once_with("ver_fail")
