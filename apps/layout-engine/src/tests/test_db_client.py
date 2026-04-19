import json
from unittest.mock import MagicMock, patch

from db_client import mark_layout_complete, mark_layout_failed, mark_layout_processing


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
