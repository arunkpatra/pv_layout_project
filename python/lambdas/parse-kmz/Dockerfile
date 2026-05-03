# syntax=docker/dockerfile:1
# AWS Lambda Python 3.12 base — arm64 / Graviton.
FROM public.ecr.aws/lambda/python:3.12

# Per D5: build context is repo root. COPY pvlayout_core sibling.
COPY python/pvlayout_core /opt/pvlayout_core
RUN pip install --no-cache-dir /opt/pvlayout_core

# Lambda-specific deps from pyproject.toml.
RUN pip install --no-cache-dir boto3 shapely

# Lambda code.
COPY python/lambdas/parse-kmz/parse_kmz_lambda ${LAMBDA_TASK_ROOT}/parse_kmz_lambda

# Bake git SHA at build time (CI passes via --build-arg).
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

CMD [ "parse_kmz_lambda.handler.handler" ]
