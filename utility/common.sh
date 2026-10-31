# Shared setup for utility/*.sh: sourced, not run.
# Env: ZESIGNAL_MCP_PORT (default 7643), ZESIGNAL_PROFILE (default zesignal).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

(( EUID != 0 )) || die "run without sudo: it asks for sudo itself, only for the AppArmor step"

# No Node is assumed on PATH: n may be installed without being linked in.
export N_PREFIX="${N_PREFIX:-$HOME/n}"
[[ -d "$N_PREFIX/bin" ]] && PATH="$N_PREFIX/bin:$PATH"

NODE_VERSION="$(tr -d 'v[:space:]' < .nvmrc)"
PNPM_VERSION="$(grep -A3 '"packageManager"' package.json | sed -n 's/.*"version": "\(.*\)".*/\1/p' | head -1)"
[[ -n "$NODE_VERSION" && -n "$PNPM_VERSION" ]] || die "cannot read Node/pnpm versions"
TOOLS="$ROOT/.tools"
PORT="${ZESIGNAL_MCP_PORT:-7643}"
PROFILE="${ZESIGNAL_PROFILE:-zesignal}"
USER_DATA="${XDG_CONFIG_HOME:-$HOME/.config}/Signal-$PROFILE"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/zesignal"
BIN_DIR="$HOME/.local/bin"
APPARMOR_PROFILE=/etc/apparmor.d/zesignal-electron
# Kept in the app's own config: production is treated as a packaged app,
# which clears $NODE_CONFIG. Updates off so the official build never
# replaces this one.
CONFIG_OVERRIDES="\"storageProfile\":\"$PROFILE\",\"updatesEnabled\":false"

print_config() {
  [[ -f "$USER_DATA/mcp.json" ]] || die "no $USER_DATA/mcp.json yet; run zesignal once first"
  local token
  token="$(sed -n 's/.*"token":"\([0-9a-f]*\)".*/\1/p' "$USER_DATA/mcp.json")"
  cat <<EOF
Add this entry to ~/.zechat/mcp.json (or Settings > MCP in zechat):

  {"name":"signal","transport":"http","url":"http://127.0.0.1:$PORT/mcp",
   "enabled":true,"authType":"bearer","apiKey":"$token","runMode":"always"}
EOF
}

# Node through n, without touching the global version; pnpm pinned in .tools/.
setup_toolchain() {
  command -v n >/dev/null || die "'n' not found (looked on PATH and in $N_PREFIX/bin)"
  if ! n exec "$NODE_VERSION" node --version >/dev/null 2>&1; then
    say "Downloading Node $NODE_VERSION"
    n download "$NODE_VERSION"
  fi
  if [[ "$(cat "$TOOLS/pnpm/.version" 2>/dev/null)" != "$PNPM_VERSION" ]]; then
    say "Installing pnpm $PNPM_VERSION into .tools/"
    # Outside the repo, so npm does not trip over Signal's devEngines check.
    (cd /tmp && n exec "$NODE_VERSION" npm i -g --silent --prefix "$TOOLS/pnpm" "pnpm@$PNPM_VERSION")
    echo "$PNPM_VERSION" > "$TOOLS/pnpm/.version"
  fi
  grep -qxF '/.tools/' .git/info/exclude 2>/dev/null || echo '/.tools/' >> .git/info/exclude
  if [[ ! -d node_modules ]] || [[ pnpm-lock.yaml -nt node_modules/.modules.yaml ]]; then
    say "Installing dependencies"
    in_node 'pnpm install --frozen-lockfile'
  fi
}

# PATH is extended inside n's environment so its Node stays first.
in_node() { n exec "$NODE_VERSION" bash -c "export PATH=\"$TOOLS/pnpm/bin:\$PATH\"; $*"; }

# Ubuntu blocks unprivileged user namespaces, which Chromium's sandbox needs,
# unless an AppArmor profile allows them: allowed here for this checkout's
# Electron and for the installed build only.
setup_sandbox() {
  [[ "$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" == 1 ]] || return 0
  local abi=4.0
  [[ -f /etc/apparmor.d/abi/4.0 ]] || abi=3.0
  local wanted="abi <abi/$abi>,
include <tunables/global>

profile zesignal-electron \"$ROOT/node_modules/.pnpm/electron@*/node_modules/electron/dist/electron\" flags=(unconfined) {
  userns,

  include if exists <local/zesignal-electron>
}

profile zesignal-installed \"$INSTALL_DIR/signal-desktop\" flags=(unconfined) {
  userns,

  include if exists <local/zesignal-installed>
}"
  if [[ "$(cat "$APPARMOR_PROFILE" 2>/dev/null)" != "$wanted" ]]; then
    say "Installing AppArmor profile for Electron's sandbox (needs sudo)"
    printf '%s\n' "$wanted" | sudo tee "$APPARMOR_PROFILE" >/dev/null
    sudo apparmor_parser -r "$APPARMOR_PROFILE"
  fi
}
