"""Domain validation for parsed KMZ output.

Per spec C4 brainstorm Q-validation; revised post-prod-smoke (2026-05-03)
to drop L4 — Shapely `is_valid` over-rejected real customer KMZs that the
legacy sidecar (no Shapely check) had accepted for years. Multi-plot
KMZs from CAD/KML editors / surveyed boundaries routinely have minor
topological imperfections (one-vertex kinks, near-duplicate points) that
Shapely's strict OGC `is_valid` flags but downstream rendering +
compute-layout handle without issue.

In-scope levels:
  1. boundaries[] non-empty
  2. each boundary has >= 3 coords
  3. each coord within WGS84 range (-90/90 lat, -180/180 lon)
  4. (DROPPED — see header) each polygon Shapely.is_valid

All validation failures raise ValidationError with a specific message
naming the failed check. Lambda handler catches and returns
{ok: False, code: "INVALID_KMZ", message: <reason>}.
"""
from __future__ import annotations

from typing import Any


class ValidationError(ValueError):
    """Raised when parsed KMZ fails domain validation."""


def validate_parsed_kmz(parsed: Any) -> None:
    """Validate the ParsedKMZ output of pvlayout_core.parse_kmz.

    Raises ValidationError on the first failure. Caller maps to
    INVALID_KMZ in the Lambda response envelope.
    """
    boundaries = getattr(parsed, "boundaries", None) or []
    if not boundaries:
        raise ValidationError("KMZ contains no boundary placemarks")

    for idx, b in enumerate(boundaries):
        coords = list(getattr(b, "coords", []) or [])
        name = getattr(b, "name", f"#{idx}")

        # Level 2: minimum vertex count.
        if len(coords) < 3:
            raise ValidationError(
                f"boundary '{name}' has {len(coords)} coords; minimum is 3"
            )

        # Level 3: WGS84 range.
        for lon, lat in coords:
            if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
                raise ValidationError(
                    f"boundary '{name}' has out-of-range coord: ({lon}, {lat})"
                )
