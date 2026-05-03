# `smoketest` Lambda

**Status: throwaway. Delete in C4.**

This Lambda exists for one reason: to prove the C3 monorepo build/push
plumbing end-to-end. The CI workflow (`build-lambdas.yml`) builds it
on every push, pushes the arm64 image to ECR repo
`solarlayout/smoketest`, and tags it with the git SHA. If that pipeline
runs green, the C3 row is verified and C4 (parse-kmz) can land
mechanically without infrastructure debugging in its own brainstorm
session.

When C4 starts, this directory is deleted in the same row's first commit
along with the ECR repo (`aws ecr delete-repository --repository-name
solarlayout/smoketest --force --region ap-south-1`).

The handler does almost nothing on purpose: returns `{"ok": true,
"engine_version": "<sha>", "pvlayout_core_importable": true}`. Any
real-world functionality should land in C4+, not here.

**Spec source:** `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md`
row C3 (§9 — phase Tier T2 verification depth).
