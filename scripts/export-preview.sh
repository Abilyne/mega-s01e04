#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: scripts/export-preview.sh OUTPUT_DIR" >&2
  exit 2
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
mkdir -p "$1"
output_dir="$(cd "$1" && pwd -P)"
case "$output_dir/" in
  "$repo_dir/"*)
    echo "output directory must be outside the repository" >&2
    exit 2
    ;;
esac

port="${PORT:-18787}"
if ! [[ "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
  echo "PORT must be an integer between 1 and 65535" >&2
  exit 2
fi

scratch_dir="$(mktemp -d)"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$scratch_dir"
}
trap cleanup EXIT INT TERM

cd "$repo_dir"
LANE_MARKER="${LANE_MARKER:-}" PORT="$port" node --import tsx --env-file-if-exists=.env src/server.ts >"$scratch_dir/server.log" 2>&1 &
server_pid=$!
url="http://127.0.0.1:$port/digest/2026-10-28"
for _ in {1..50}; do
  if curl --fail --silent "$url" --output "$output_dir/index.html"; then
    echo "Exported $url to $output_dir/index.html"
    exit 0
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    cat "$scratch_dir/server.log" >&2
    echo "rig stopped before the digest was available" >&2
    exit 1
  fi
  sleep 0.2
done

cat "$scratch_dir/server.log" >&2
echo "timed out waiting for $url" >&2
exit 1
