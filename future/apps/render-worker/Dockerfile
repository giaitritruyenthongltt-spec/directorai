# P5.05a — Render worker container.
#
# Built from the existing apps/context-engine Python sidecar plus
# the @directorai/render-queue Node dispatcher. The container is
# deployed to Modal / Fly.io / RunPod (owner-completed in Track C
# C.12); the queue backend (Redis or Postgres) is wired via env.
#
# Privacy (P5.05c): no media baked in. Worker pulls media from a
# short-lived signed URL hashed by sha256 and auto-purges /tmp on
# exit.

FROM nvidia/cuda:12.6.0-runtime-ubuntu22.04 AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3-pip python3.11-venv curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Node for the dispatcher
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python sidecar deps (Whisper, PySceneDetect, librosa via uv)
COPY apps/context-engine/pyproject.toml apps/context-engine/uv.lock ./context-engine/
RUN pip install --no-cache-dir uv && cd context-engine && uv sync --frozen

# Node dispatcher
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/render-queue ./packages/render-queue
RUN corepack enable && pnpm install --frozen-lockfile --filter @directorai/render-queue

# Worker entry script (owner-completed when full job handler lands)
COPY apps/render-worker/worker.mjs ./

# Read-only-tmpfs /tmp for media — auto-purges on exit
VOLUME ["/tmp/da-media"]

# Env hints (owner sets at deploy):
#   QUEUE_URL=redis://… or postgres://…
#   MAX_CONCURRENT_JOBS=2
#   PROVIDER_CENTS_PER_MIN=2

CMD ["node", "worker.mjs"]
