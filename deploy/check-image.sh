#!/bin/sh
# Checks a built GOCARMO Ride image: what a deploy relies on and what the
# licences ask for. Run by .github/workflows/ride-ci.yml after the build.
#
#   deploy/check-image.sh IMAGE EXPECTED_SHA
#
# Run it from the repository root: LICENSE and NOTICE.md there are compared
# with the copies the image serves. Needs docker and curl.
#
#   RIDE_CHECK_PORT=18080         local port the test server is published on
#   RIDE_CHECK_HOST_NETWORK=1     for a Docker daemon without a bridge network
set -eu

usage="usage: deploy/check-image.sh IMAGE EXPECTED_SHA"
image=${1:?$usage}
sha=${2:?$usage}
port=${RIDE_CHECK_PORT:-18080}
base="http://127.0.0.1:$port"
cid=""

fail() {
  echo "check-image: $*" >&2
  exit 1
}

cleanup() {
  [ -z "$cid" ] || docker rm -f "$cid" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "1. Files, user and build label inside the image"
# shellcheck disable=SC2016 # the script runs in the container's shell, not here
docker run --rm --network none --entrypoint /bin/sh -e EXPECTED_SHA="$sha" "$image" -c '
  set -eu
  [ "$(id -u):$(id -g)" = "10001:10001" ] || { echo "runs as $(id -u):$(id -g), not as 10001:10001"; exit 1; }
  for f in /app/LICENSE /app/NOTICE.md /app/client/LICENSE.txt /app/client/NOTICE.txt \
           /app/client/index.html /app/routes/rolling-hills.json; do
    [ -s "$f" ] || { echo "missing or empty: $f"; exit 1; }
  done
  cmp -s /app/LICENSE /app/client/LICENSE.txt || { echo "the served LICENSE.txt differs from LICENSE"; exit 1; }
  cmp -s /app/NOTICE.md /app/client/NOTICE.txt || { echo "the served NOTICE.txt differs from NOTICE.md"; exit 1; }
  grep -q "sha: \"$EXPECTED_SHA\"" /app/client/js/build.js || { echo "the client build label is not $EXPECTED_SHA:"; cat /app/client/js/build.js; exit 1; }
  [ "$OPENRADLR_BUILD_SHA" = "$EXPECTED_SHA" ] || { echo "the server build label is $OPENRADLR_BUILD_SHA, not $EXPECTED_SHA"; exit 1; }
  [ -w /app/data ] || { echo "/app/data is not writable by the server user"; exit 1; }
  [ ! -w /app/client/index.html ] || { echo "the client files are writable by the server user"; exit 1; }
' || fail "the image is not what a deploy expects"

licences=$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.licenses"}}' "$image")
[ "$licences" = "AGPL-3.0-or-later" ] || fail "the image label says licence \"$licences\""

echo "2. The server starts, reports healthy and names itself"
if [ -n "${RIDE_CHECK_HOST_NETWORK:-}" ]; then
  cid=$(docker run -d --network host -e OPENRADLR_BIND="127.0.0.1:$port" "$image")
else
  cid=$(docker run -d -p "127.0.0.1:$port:8080" "$image")
fi

tries=0
until curl -fsS -o /dev/null "$base/healthz" 2>/dev/null; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    docker logs "$cid" >&2 || true
    fail "no answer on /healthz after 60 s"
  fi
  sleep 1
done

# The image's own HEALTHCHECK (`openradlr-server healthcheck`), which Docker Compose waits for.
tries=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid")" = "healthy" ]; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    docker inspect -f '{{json .State.Health}}' "$cid" >&2 || true
    fail "the container did not become healthy in 60 s"
  fi
  sleep 1
done

info=$(curl -fsS "$base/api/info")
case $info in
  *'"name":"GOCARMO Ride"'*) ;;
  *) fail "the server does not call itself GOCARMO Ride: $info" ;;
esac
case $info in
  *"\"sha\":\"$sha\""*) ;;
  *) fail "/api/info does not report build $sha: $info" ;;
esac

echo "3. The licence, the notice and the build label are served"
curl -fsS "$base/LICENSE.txt" | cmp -s - LICENSE || fail "/LICENSE.txt is not this repository's LICENSE"
curl -fsS "$base/NOTICE.txt" | cmp -s - NOTICE.md || fail "/NOTICE.txt is not this repository's NOTICE.md"
curl -fsS "$base/js/build.js" | grep -q "sha: \"$sha\"" || fail "/js/build.js does not carry build $sha"
curl -fsS "$base/" | grep -q "GOCARMO Ride" || fail "the start page does not say GOCARMO Ride"

echo "4. The server stops when asked"
docker stop -t 20 "$cid" >/dev/null
code=$(docker inspect -f '{{.State.ExitCode}}' "$cid")
[ "$code" = "0" ] || fail "the server left with exit code $code after SIGTERM"

echo "check-image: $image is fine (build $sha)"
