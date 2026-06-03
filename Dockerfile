# Stelvin demo backend (settler SSE server) — for Railway / any container host.
# The backend drives the LIVE testnet contract via the stellar CLI, so the image
# bundles the CLI binary; identities + deployed addresses are injected at runtime
# from env vars (see docker-entrypoint.sh) — no secrets baked into the image.
FROM node:20-slim

# libdbus-1-3: the stellar CLI binary dynamically links libdbus-1.so.3 at load
# time (OS keychain integration); without it the binary won't even run on slim.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates libdbus-1-3 \
    && rm -rf /var/lib/apt/lists/*

# stellar CLI binary, matching the version used to build/deploy the contract.
ARG STELLAR_VERSION=25.2.0
RUN curl -fsSL "https://github.com/stellar/stellar-cli/releases/download/v${STELLAR_VERSION}/stellar-cli-${STELLAR_VERSION}-x86_64-unknown-linux-gnu.tar.gz" -o /tmp/s.tgz \
    && mkdir -p /tmp/s && tar -xzf /tmp/s.tgz -C /tmp/s \
    && cp "$(find /tmp/s -name stellar -type f | head -1)" /usr/local/bin/stellar \
    && chmod +x /usr/local/bin/stellar && rm -rf /tmp/s* \
    && stellar --version

WORKDIR /app
COPY settler/package*.json ./settler/
RUN cd settler && npm install --include=dev
COPY settler ./settler
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 8787
CMD ["./docker-entrypoint.sh"]
