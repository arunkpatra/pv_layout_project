-- B26: parsed KMZ boundary stored at B11 create-time so the desktop's
-- RecentsView can render an SVG outline fallback (memo v3 §14) without
-- re-parsing the KMZ for every list-row render. Nullable so projects
-- created before B26 keep working — they fall back to the muted
-- placeholder, same behavior as before.
ALTER TABLE "projects" ADD COLUMN "boundaryGeojson" JSONB;
