"""
Database client for the layout engine.
Uses raw psycopg2 — no ORM. Owns all LayoutJob and Version status transitions
after the initial QUEUED write (which Hono API owns).
"""
import json
import os

import psycopg2


def _connect():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def mark_layout_processing(version_id: str) -> None:
    """Transition LayoutJob and Version from QUEUED → PROCESSING."""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE "LayoutJob"
                   SET status = 'PROCESSING', "startedAt" = NOW()
                   WHERE "versionId" = %s""",
                (version_id,),
            )
            cur.execute(
                """UPDATE "Version"
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
    Transition LayoutJob PROCESSING → COMPLETE with artifact S3 keys and statsJson.
    Also sets Version → COMPLETE (updated in Spike 8 when energy job is added).
    """
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE "LayoutJob"
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
                """UPDATE "Version"
                   SET status = 'COMPLETE', "updatedAt" = NOW()
                   WHERE id = %s""",
                (version_id,),
            )
        conn.commit()


def mark_layout_failed(version_id: str, error: str) -> None:
    """Transition LayoutJob and Version to FAILED with error detail."""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE "LayoutJob"
                   SET status = 'FAILED',
                       "errorDetail" = %s,
                       "completedAt" = NOW()
                   WHERE "versionId" = %s""",
                (error[:500], version_id),
            )
            cur.execute(
                """UPDATE "Version"
                   SET status = 'FAILED', "updatedAt" = NOW()
                   WHERE id = %s""",
                (version_id,),
            )
        conn.commit()
