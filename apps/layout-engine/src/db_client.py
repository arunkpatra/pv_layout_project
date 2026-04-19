"""
Database client for the layout engine.
Uses raw psycopg2 — no ORM. Owns all layout_jobs and versions status transitions
after the initial QUEUED write (which Hono API owns).

Table names are Prisma-mapped snake_case: layout_jobs, versions.
CamelCase column names must be quoted.
"""
import json
import os

import psycopg2


def _connect():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def mark_layout_processing(version_id: str) -> None:
    """Transition layout_jobs and versions from QUEUED → PROCESSING."""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE layout_jobs
                   SET status = 'PROCESSING', "startedAt" = NOW()
                   WHERE "versionId" = %s""",
                (version_id,),
            )
            cur.execute(
                """UPDATE versions
                   SET status = 'PROCESSING', "updatedAt" = NOW()
                   WHERE id = %s""",
                (version_id,),
            )
        conn.commit()


def mark_layout_complete(
    version_id: str,
    kmz_key: str,
    svg_key: str,
    dxf_key: str,
    stats: dict,
) -> None:
    """
    Transition layout_jobs PROCESSING → COMPLETE with artifact S3 keys and statsJson.
    Also sets versions → COMPLETE.
    """
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE layout_jobs
                   SET status = 'COMPLETE',
                       "kmzArtifactS3Key" = %s,
                       "svgArtifactS3Key" = %s,
                       "dxfArtifactS3Key" = %s,
                       "statsJson" = %s,
                       "completedAt" = NOW()
                   WHERE "versionId" = %s""",
                (kmz_key, svg_key, dxf_key, json.dumps(stats), version_id),
            )
            cur.execute(
                """UPDATE versions
                   SET status = 'COMPLETE', "updatedAt" = NOW()
                   WHERE id = %s""",
                (version_id,),
            )
        conn.commit()


def get_version(version_id: str) -> tuple[str, str, dict]:
    """
    Returns (project_id, kmz_s3_key, input_snapshot) for the given version.
    Raises ValueError if version not found.
    """
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT "projectId", "kmzS3Key", "inputSnapshot"
                   FROM versions
                   WHERE id = %s""",
                (version_id,),
            )
            row = cur.fetchone()
    if row is None:
        raise ValueError(f"Version not found: {version_id}")
    project_id, kmz_s3_key, input_snapshot = row
    if input_snapshot is None:
        raise ValueError(f"Version {version_id} has no inputSnapshot")
    if isinstance(input_snapshot, str):
        input_snapshot = json.loads(input_snapshot)
    return project_id, kmz_s3_key, input_snapshot


def mark_layout_failed(version_id: str, error: str) -> None:
    """Transition layout_jobs and versions to FAILED with error detail."""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE layout_jobs
                   SET status = 'FAILED',
                       "errorDetail" = %s,
                       "completedAt" = NOW()
                   WHERE "versionId" = %s""",
                (error[:500], version_id),
            )
            cur.execute(
                """UPDATE versions
                   SET status = 'FAILED', "updatedAt" = NOW()
                   WHERE id = %s""",
                (version_id,),
            )
        conn.commit()
