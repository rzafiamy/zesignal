#!/usr/bin/env bash
# Resync the zesignal branch onto Signal Desktop upstream, push, reinstall.
#
#   utility/sync.sh                 rebase onto the latest stable release tag
#   utility/sync.sh --main          rebase onto upstream main (alpha)
#   utility/sync.sh --to v8.33.0    rebase onto a given tag or commit
#   utility/sync.sh --no-push       do not push to origin
#   utility/sync.sh --no-install    do not run utility/install.sh afterwards
#
# Fork commits are recognised by their subject prefix "zesignal:"; keep it on
# every commit of this branch, or the rebase will not carry that commit over.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

BRANCH=zesignal
TARGET="" PUSH=1 INSTALL=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --main) TARGET=upstream/main ;;
    --to) TARGET="${2:?--to needs a ref}"; shift ;;
    --no-push) PUSH=0 ;;
    --no-install) INSTALL=0 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

[[ "$(git branch --show-current)" == "$BRANCH" ]] || die "check out the $BRANCH branch first"
git diff --quiet && git diff --cached --quiet || die "commit or stash your changes first"
git remote get-url upstream >/dev/null 2>&1 \
  || git remote add upstream https://github.com/signalapp/Signal-Desktop.git

say "Fetching upstream"
if [[ "$(git rev-parse --is-shallow-repository)" == true ]]; then
  # The rebase needs the history between the old and the new base.
  git fetch --unshallow --filter=blob:none upstream
fi
git fetch --tags --filter=blob:none upstream main

if [[ -z "$TARGET" ]]; then
  TARGET="$(git tag -l 'v*' | grep -v -e '-' | sort -V | tail -1)"
  [[ -n "$TARGET" ]] || die "no stable release tag found"
fi
git rev-parse -q --verify "$TARGET^{commit}" >/dev/null || die "unknown ref: $TARGET"

first="$(git log --reverse --format=%H --grep='^zesignal:' HEAD | head -1)"
[[ -n "$first" ]] || die "no 'zesignal:' commits on $BRANCH"
old_base="$(git rev-parse "$first^")"
if [[ "$(git rev-parse "$TARGET^{commit}")" == "$old_base" ]]; then
  say "Already on $TARGET"
else
  say "Rebasing $BRANCH onto $TARGET"
  git tag -f zesignal-before-sync HEAD >/dev/null
  if ! git rebase --onto "$TARGET" "$old_base" "$BRANCH"; then
    cat >&2 <<EOF

Conflicts. Resolve them, then:
  git add <files> && git rebase --continue
  git push --force-with-lease origin $BRANCH && utility/install.sh
To give up: git rebase --abort   (the old state is tag zesignal-before-sync)
EOF
    exit 1
  fi
fi

if (( PUSH )); then
  say "Pushing"
  git push --force-with-lease origin "$BRANCH"
  # Keep the fork's main a plain mirror of upstream.
  git push origin upstream/main:refs/heads/main
fi

if (( INSTALL )); then
  "$ROOT/utility/install.sh"
fi
