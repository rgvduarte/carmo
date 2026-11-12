# syntax=docker/dockerfile:1.7
#
# GOCARMO Ride server image: the Rust game server plus the static browser
# client. GOCARMO Ride is a modified version of OpenRadlr (see NOTICE.md). The
# binary, the user and the settings keep the original's names.

# --- Build -------------------------------------------------------------------
FROM rust:1-slim-bookworm@sha256:f2c004e3d2d8b547e8cf7ffbc29205385f4e71d23e53e4e383065db5e9f822cd AS builder
WORKDIR /build

# Cargo.lock is optional until it is committed; the glob keeps the build working either way.
COPY server/Cargo.toml server/Cargo.lock* server/rustfmt.toml ./
COPY server/crates ./crates

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target \
    cargo build --release --bin openradlr-server \
    && cp target/release/openradlr-server /usr/local/bin/openradlr-server

# --- Runtime -----------------------------------------------------------------
FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc AS runtime

# Which build this is (git commit and date). `make up` / `make update`, CI and
# the Fly workflow pass OPENRADLR_BUILD_SHA. Render hands a Docker build its own
# variables as build arguments, RENDER_GIT_COMMIT among them: it is used when
# OPENRADLR_BUILD_SHA is not given. With neither the label is `dev`, and the
# client's source link points at the branch instead of a commit.
ARG OPENRADLR_BUILD_SHA=
ARG RENDER_GIT_COMMIT=
ARG OPENRADLR_BUILD_DATE=
ARG GC_FALLBACK_SHA=${RENDER_GIT_COMMIT:-dev}
ARG GC_BUILD_SHA=${OPENRADLR_BUILD_SHA:-$GC_FALLBACK_SHA}

LABEL org.opencontainers.image.title="GOCARMO Ride" \
      org.opencontainers.image.description="GOCARMO Ride: game server and browser client. A modified version of OpenRadlr, not the official one." \
      org.opencontainers.image.source="https://github.com/rgvduarte/carmo" \
      org.opencontainers.image.revision="${GC_BUILD_SHA}" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"

RUN groupadd --system --gid 10001 openradlr \
    && useradd --system --uid 10001 --gid openradlr --no-create-home --shell /usr/sbin/nologin openradlr

COPY --from=builder /usr/local/bin/openradlr-server /usr/local/bin/openradlr-server
COPY client/public /app/client
# The client reports its own build, so a rider's cached copy can be told from the server's.
RUN printf 'export const BUILD = { sha: "%s", date: "%s" };\n' "${GC_BUILD_SHA}" "${OPENRADLR_BUILD_DATE}" > /app/client/js/build.js
COPY routes /app/routes
# The licence and the fork's notice travel with the image (the client serves
# its own copies as /LICENSE.txt and /NOTICE.txt).
COPY LICENSE NOTICE.md /app/

ENV OPENRADLR_SERVER_NAME="GOCARMO Ride" \
    OPENRADLR_BIND=0.0.0.0:8080 \
    OPENRADLR_STATIC_DIR=/app/client \
    OPENRADLR_ROUTE_FILE=/app/routes/rolling-hills.json \
    OPENRADLR_ROUTES_DIR=/app/routes \
    OPENRADLR_DATA_DIR=/app/data \
    OPENRADLR_BUILD_SHA=${GC_BUILD_SHA} \
    OPENRADLR_BUILD_DATE=${OPENRADLR_BUILD_DATE} \
    RUST_LOG=info

# Strava logins live here (a volume in docker-compose.yml); owned by the server's user.
RUN mkdir -p /app/data && chown openradlr:openradlr /app/data

# Numeric form keeps the same ids and works with orchestrators (hadolint DL3066).
USER 10001:10001
WORKDIR /app
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD ["openradlr-server", "healthcheck"]

ENTRYPOINT ["openradlr-server"]
