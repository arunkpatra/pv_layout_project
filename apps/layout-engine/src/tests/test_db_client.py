import json
from unittest.mock import MagicMock, patch

import pytest

from db_client import (
    get_version,
    mark_layout_complete,
    mark_layout_failed,
    mark_layout_processing,
)


def _mock_conn():
    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    cursor_ctx = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor_ctx)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return conn, cursor_ctx


def test_mark_layout_processing_executes_two_updates():
    conn, cur = _mock_conn()
    with patch("db_client._connect", return_value=conn):
        mark_layout_processing("ver_abc123")

    assert cur.execute.call_count == 2
    first_sql = cur.execute.call_args_list[0][0][0]
    assert "layout_jobs" in first_sql
    assert "PROCESSING" in first_sql
    second_sql = cur.execute.call_args_list[1][0][0]
    assert "versions" in second_sql
    conn.commit.assert_called_once()


def test_mark_layout_complete_sets_artifact_keys_and_stats():
    conn, cur = _mock_conn()
    stats = {"total_tables": 42, "total_capacity_mwp": 5.1}
    with patch("db_client._connect", return_value=conn):
        mark_layout_complete(
            version_id="ver_abc123",
            kmz_key="projects/p/versions/v/layout.kmz",
            svg_key="projects/p/versions/v/layout.svg",
            dxf_key="projects/p/versions/v/layout.dxf",
            stats=stats,
        )

    assert cur.execute.call_count == 2
    first_sql, first_args = cur.execute.call_args_list[0][0]
    assert "COMPLETE" in first_sql
    assert "kmzArtifactS3Key" in first_sql
    assert "svgArtifactS3Key" in first_sql
    assert "dxfArtifactS3Key" in first_sql
    assert "statsJson" in first_sql
    assert json.loads(first_args[3]) == stats
    conn.commit.assert_called_once()


def test_mark_layout_failed_sets_error_detail():
    conn, cur = _mock_conn()
    with patch("db_client._connect", return_value=conn):
        mark_layout_failed("ver_abc123", "KMZ parse error: invalid coordinates")

    assert cur.execute.call_count == 2
    first_sql = cur.execute.call_args_list[0][0][0]
    assert "FAILED" in first_sql
    assert "errorDetail" in first_sql
    conn.commit.assert_called_once()


def test_get_version_returns_project_id_kmz_key_and_snapshot():
    conn, cur = _mock_conn()
    cur.fetchone.return_value = (
        "prj_abc123",
        "projects/prj_abc123/versions/ver_xyz/input.kmz",
        {"tilt_angle": 18.0, "modules_in_row": 28},
    )
    with patch("db_client._connect", return_value=conn):
        project_id, kmz_s3_key, snapshot = get_version("ver_xyz")

    assert project_id == "prj_abc123"
    assert kmz_s3_key == "projects/prj_abc123/versions/ver_xyz/input.kmz"
    assert snapshot == {"tilt_angle": 18.0, "modules_in_row": 28}
    assert cur.execute.call_count == 1
    sql = cur.execute.call_args_list[0][0][0]
    assert "versions" in sql
    assert "projectId" in sql
    assert "kmzS3Key" in sql


def test_get_version_raises_if_not_found():
    conn, cur = _mock_conn()
    cur.fetchone.return_value = None
    with patch("db_client._connect", return_value=conn):
        with pytest.raises(ValueError, match="Version not found"):
            get_version("ver_nonexistent")
