"""
Tests for handle_layout_job — Spike 2c production contract.

Mocks everything external (S3, DB, core layout pipeline).
Verifies orchestration: PROCESSING → download → layout → upload × 3 → COMPLETE,
and FAILED path when any step raises.
"""
import os
from unittest.mock import MagicMock, patch

import pytest

from handlers import handle_layout_job


def _make_parse_result():
    r = MagicMock()
    r.boundaries = []
    r.centroid_lat = 12.0
    r.centroid_lon = 77.0
    return r


def test_handle_layout_job_transitions_processing_then_complete():
    """Happy path: marks PROCESSING before work, COMPLETE after."""
    with (
        patch("handlers.mark_layout_processing") as mock_proc,
        patch("handlers.mark_layout_complete") as mock_complete,
        patch("handlers.mark_layout_failed") as mock_failed,
        patch("handlers.download_from_s3"),
        patch("handlers.upload_to_s3"),
        patch("handlers.parse_kmz", return_value=_make_parse_result()),
        patch("handlers.run_layout_multi", return_value=[]),
        patch("handlers.place_string_inverters"),
        patch("handlers.place_lightning_arresters"),
        patch("handlers.export_kmz"),
        patch("handlers.export_svg"),
        patch("handlers.export_dxf"),
        patch.dict(os.environ, {"S3_BUCKET": "test-bucket"}),
    ):
        handle_layout_job("ver_abc", "projects/p/v/input.kmz", {})

    mock_proc.assert_called_once_with("ver_abc")
    mock_complete.assert_called_once()
    assert mock_complete.call_args[0][0] == "ver_abc"
    mock_failed.assert_not_called()


def test_handle_layout_job_uploads_three_artifacts():
    """Three S3 uploads happen: layout.kmz, layout.svg, layout.dxf."""
    with (
        patch("handlers.mark_layout_processing"),
        patch("handlers.mark_layout_complete"),
        patch("handlers.download_from_s3"),
        patch("handlers.upload_to_s3") as mock_ul,
        patch("handlers.parse_kmz", return_value=_make_parse_result()),
        patch("handlers.run_layout_multi", return_value=[]),
        patch("handlers.place_string_inverters"),
        patch("handlers.place_lightning_arresters"),
        patch("handlers.export_kmz"),
        patch("handlers.export_svg"),
        patch("handlers.export_dxf"),
        patch.dict(os.environ, {"S3_BUCKET": "test-bucket"}),
    ):
        handle_layout_job("ver_xyz", "projects/p/v/input.kmz", {})

    assert mock_ul.call_count == 3
    uploaded_keys = [call[0][2] for call in mock_ul.call_args_list]
    assert any("layout.kmz" in k for k in uploaded_keys)
    assert any("layout.svg" in k for k in uploaded_keys)
    assert any("layout.dxf" in k for k in uploaded_keys)


def test_handle_layout_job_marks_failed_and_reraises_on_error():
    """If any step raises, job is marked FAILED and the exception propagates."""
    with (
        patch("handlers.mark_layout_processing"),
        patch("handlers.mark_layout_failed") as mock_failed,
        patch("handlers.mark_layout_complete") as mock_complete,
        patch(
            "handlers.download_from_s3",
            side_effect=RuntimeError("bucket not found"),
        ),
        patch.dict(os.environ, {"S3_BUCKET": "test-bucket"}),
    ):
        with pytest.raises(RuntimeError, match="bucket not found"):
            handle_layout_job("ver_abc", "projects/p/v/input.kmz", {})

    mock_failed.assert_called_once()
    assert mock_failed.call_args[0][0] == "ver_abc"
    assert "bucket not found" in mock_failed.call_args[0][1]
    mock_complete.assert_not_called()
