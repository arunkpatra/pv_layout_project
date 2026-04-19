FROM public.ecr.aws/lambda/python:3.13

# Copy uv binary from official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR ${LAMBDA_TASK_ROOT}

# Install production dependencies from lock file
COPY pyproject.toml uv.lock ./
RUN /uv export --frozen --no-dev --no-emit-project -o requirements.txt \
    && /uv pip install --system -r requirements.txt \
    && rm requirements.txt

# Copy application source
COPY src/ ./

CMD ["lambda_handler.handler"]
