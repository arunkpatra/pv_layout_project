# syntax=docker/dockerfile:1
# AWS Lambda Python 3.12 runtime — arm64 (Graviton) selected via
# build platform; the base image is a multi-arch manifest.
FROM public.ecr.aws/lambda/python:3.12

# Per D5: build context is repo root. COPY pvlayout_core sibling
# package in and install it.
COPY python/pvlayout_core /opt/pvlayout_core
RUN pip install --no-cache-dir /opt/pvlayout_core

# Lambda-specific code into LAMBDA_TASK_ROOT.
COPY python/lambdas/_smoketest/smoketest_lambda ${LAMBDA_TASK_ROOT}/smoketest_lambda

# Bake git SHA at build time. The CI workflow passes
# --build-arg GIT_SHA=${{ github.sha }}; locally use $(git rev-parse HEAD).
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

CMD [ "smoketest_lambda.handler.handler" ]
