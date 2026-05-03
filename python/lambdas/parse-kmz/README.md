# parse-kmz Lambda

Cloud entry point for KMZ parsing. Replaces sidecar `/parse-kmz` (per spec C4).

## Local development

```bash
cd python/lambdas/parse-kmz
uv sync --extra dev
uv run python -m parse_kmz_lambda.server   # listens on port 4101
```

mvp_api with `USE_LOCAL_ENVIRONMENT=true` routes `lambdaInvoker.invoke("parse-kmz", ...)` to `http://localhost:4101/invoke`.

## Tests

```bash
uv run python -m pytest tests/ -v
```

Mocks S3 via [moto](https://github.com/getmoto/moto). 15 tests cover:
- Success path (real KMZ fixture from pvlayout_core).
- KMZ_NOT_FOUND, INVALID_KMZ (4 sub-cases via synthetic fixtures), INTERNAL_ERROR.

## Wire contract

- **Event:** `{"bucket": "<s3-bucket>", "key": "<s3-key>"}`
- **Response (success):** `{"ok": true, "parsed": {"boundaries": [...], "centroid_lat": ..., "centroid_lon": ...}}`
- **Response (failure):** `{"ok": false, "code": "<KMZ_NOT_FOUND|INVALID_KMZ|INTERNAL_ERROR>", "message": "...", ...}`

See `docs/superpowers/specs/2026-05-03-c4-parse-kmz-lambda.md` Q3 for the rationale.
