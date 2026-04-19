"""
Tests for handle_layout_job — Spike 3 signature: handle_layout_job(version_id) only.

Reads project_id, kmz_s3_key, input_snapshot from DB via get_version.
Output S3 prefix: projects/{project_id}/versions/{version_id}/
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


_VERSION_ID = "ver_abc"
_PROJECT_ID = "prj_xyz"
_KMZ_KEY = f"projects/{_PROJECT_ID}/versions/{_VERSION_ID}/input.kmz"
_EXPECTED_PREFIX = f"projects/{_PROJECT_ID}/versions/{_VERSION_ID}"


def test_handle_layout_job_reads_version_from_db():
    """get_version is called with the version_id."""
    with (
        patch("handlers.get_version", return_value=(_PROJECT_ID, _KMZ_KEY, {})) as mock_gv,
        patch("handlers.mark_layout_processing"),
        patch("handlers.mark_layout_complete"),
        patch("handlers.download_from_s3"),
        patch("handlers.upload_to_s3"),
        patch("handlers.parse_kmz", return_value=_make_parse_result()),
        patch("handlers.run_layout_multi", return_value=[]),
        patch("handlers.place_string_inverters"),
        patch("handlers.place_lightning_arresters"),
        patch("handlers.export_kmz"),
        patch("handlers.export_svg"),
        patch("handlers.export_dxf"),
        patch.dict(os.environ, {"S3_ARTIFACTS_BUCKET": "test-bucket"}),
    ):
        handle_layout_job(_VERSION_ID)

    mock_gv.assert_called_once_with(_VERSION_ID)


def test_handle_layout_job_transitions_processing_then_complete():
    """Happy path: marks PROCESSING before work, COMPLETE after."""
    with (
        patch("handlers.get_version", return_value=(_PROJECT_ID, _KMZ_KEY, {})),
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
        patch.dict(os.environ, {"S3_ARTIFACTS_BUCKET": "test-bucket"}),
    ):
        handle_layout_job(_VERSION_ID)

    mock_proc.assert_called_once_with(_VERSION_ID)
    mock_complete.assert_called_once()
    assert mock_complete.call_args[0][0] == _VERSION_ID
    mock_failed.assert_not_called()


def test_handle_layout_job_uploads_three_artifacts_with_correct_prefix():
    """Three S3 uploads go to projects/{project_id}/versions/{version_id}/."""
    with (
        patch("handlers.get_version", return_value=(_PROJECT_ID, _KMZ_KEY, {})),
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
        patch.dict(os.environ, {"S3_ARTIFACTS_BUCKET": "test-bucket"}),
    ):
        handle_layout_job(_VERSION_ID)

    assert mock_ul.call_count == 3
    uploaded_keys = [c[0][2] for c in mock_ul.call_args_list]
    assert f"{_EXPECTED_PREFIX}/layout.kmz" in uploaded_keys
    assert f"{_EXPECTED_PREFIX}/layout.svg" in uploaded_keys
    assert f"{_EXPECTED_PREFIX}/layout.dxf" in uploaded_keys


def test_handle_layout_job_marks_failed_and_reraises_on_error():
    """If any step raises, job is marked FAILED and the exception propagates."""
    with (
        patch("handlers.get_version", return_value=(_PROJECT_ID, _KMZ_KEY, {})),
        patch("handlers.mark_layout_processing"),
        patch("handlers.mark_layout_failed") as mock_failed,
        patch("handlers.mark_layout_complete") as mock_complete,
        patch(
            "handlers.download_from_s3",
            side_effect=RuntimeError("bucket not found"),
        ),
        patch.dict(os.environ, {"S3_ARTIFACTS_BUCKET": "test-bucket"}),
    ):
        with pytest.raises(RuntimeError, match="bucket not found"):
            handle_layout_job(_VERSION_ID)

    mock_failed.assert_called_once()
    assert mock_failed.call_args[0][0] == _VERSION_ID
    assert "bucket not found" in mock_failed.call_args[0][1]
    mock_complete.assert_not_called()


def test_handle_layout_job_marks_failed_if_mark_processing_raises():
    """If mark_layout_processing raises, job failure is recorded and exception re-raised."""
    with (
        patch("handlers.get_version", return_value=(_PROJECT_ID, _KMZ_KEY, {})),
        patch(
            "handlers.mark_layout_processing",
            side_effect=RuntimeError("db down"),
        ),
        patch("handlers.mark_layout_failed") as mock_failed,
        patch("handlers.mark_layout_complete") as mock_complete,
        patch.dict(os.environ, {"S3_ARTIFACTS_BUCKET": "test-bucket"}),
    ):
        with pytest.raises(RuntimeError, match="db down"):
            handle_layout_job(_VERSION_ID)

    mock_failed.assert_called_once()
    assert mock_failed.call_args[0][0] == _VERSION_ID
    mock_complete.assert_not_called()


def test_handle_layout_job_marks_failed_if_get_version_raises():
    """If get_version raises ValueError, exception propagates (job stays QUEUED — no DB record)."""
    with (
        patch(
            "handlers.get_version",
            side_effect=ValueError("Version not found: ver_missing"),
        ),
        patch("handlers.mark_layout_processing") as mock_proc,
        patch("handlers.mark_layout_failed") as mock_failed,
        patch.dict(os.environ, {"S3_ARTIFACTS_BUCKET": "test-bucket"}),
    ):
        with pytest.raises(ValueError, match="Version not found"):
            handle_layout_job(_VERSION_ID)

    mock_proc.assert_not_called()
    mock_failed.assert_not_called()


def test_handle_layout_job_processing_called_before_complete():
    """mark_layout_processing is called before mark_layout_complete."""
    call_order = []
    with (
        patch("handlers.get_version", return_value=(_PROJECT_ID, _KMZ_KEY, {})),
        patch("handlers.mark_layout_processing", side_effect=lambda *a: call_order.append("processing")),
        patch("handlers.mark_layout_complete", side_effect=lambda *a: call_order.append("complete")),
        patch("handlers.mark_layout_failed"),
        patch("handlers.download_from_s3"),
        patch("handlers.upload_to_s3"),
        patch("handlers.parse_kmz", return_value=_make_parse_result()),
        patch("handlers.run_layout_multi", return_value=[]),
        patch("handlers.place_string_inverters"),
        patch("handlers.place_lightning_arresters"),
        patch("handlers.export_kmz"),
        patch("handlers.export_svg"),
        patch("handlers.export_dxf"),
        patch.dict(os.environ, {"S3_ARTIFACTS_BUCKET": "test-bucket"}),
    ):
        handle_layout_job(_VERSION_ID)

    assert call_order == ["processing", "complete"]
