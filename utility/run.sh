#!/usr/bin/env bash
# Build and run zesignal (Signal Desktop fork) from source, MCP server enabled.
#
#   utility/run.sh               build, then run
#   utility/run.sh --no-build    run the last build
#   utility/run.sh --config      print the zechat mcp.json entry and exit
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

BUILD=1
case "${1:-}" in
  --no-build) BUILD=0 ;;
  --config) print_config; exit 0 ;;
  "") ;;
  *) die "unknown option: $1" ;;
esac

setup_toolchain
if (( BUILD )); then
  say "Building"
  in_node 'pnpm run generate'
  build_panel
fi
setup_sandbox

say "Starting zesignal (data: $USER_DATA, MCP: http://127.0.0.1:$PORT/mcp)"
[[ -f "$USER_DATA/mcp.json" ]] || say "First run: link your phone, then run: utility/run.sh --config"
# production = real Signal servers (development uses staging, which cannot
# link a real phone). config/local.json is gitignored and read in every
# environment.
printf '{%s}\n' "$CONFIG_OVERRIDES" > config/local.json
export NODE_ENV=production
export ZESIGNAL_MCP=1 ZESIGNAL_MCP_PORT="$PORT"
in_node 'pnpm start'
