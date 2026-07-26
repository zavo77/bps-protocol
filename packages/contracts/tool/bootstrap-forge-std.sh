#!/usr/bin/env bash
# bootstrap-forge-std.sh — reproducibly install the PINNED forge-std into the gitignored
# packages/contracts/lib/forge-std on a fresh clone. TASK 10K-6.
#
# Guarantees:
#   * Pins the exact commit (v1.9.7) — a fresh clone always gets byte-identical test tooling.
#   * Verifies the checked-out commit AND package version; REFUSES (non-zero exit) on any mismatch.
#   * NEVER overwrites an existing lib/forge-std (protects local modifications) — it only verifies it.
#   * Contains no secrets, no keys, no credentials, and performs no broadcast/deploy/signing.
#
# Usage:  packages/contracts/tool/bootstrap-forge-std.sh
set -euo pipefail

PINNED_COMMIT="77041d2ce690e692d6e03cc812b57d1ddaa4d505"
EXPECTED_VERSION="1.9.7"
REPO_URL="https://github.com/foundry-rs/forge-std.git"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LIB_DIR="${CONTRACTS_DIR}/lib/forge-std"

pkg_version() { # $1 = dir; echoes package.json "version" or empty
  grep -m1 '"version"' "$1/package.json" 2>/dev/null | sed -E 's/.*"version"[^"]*"([^"]+)".*/\1/'
}

# --- Case 1: forge-std already present -> verify only, never overwrite. ---
if [ -e "${LIB_DIR}" ]; then
  if [ ! -f "${LIB_DIR}/package.json" ]; then
    echo "ERROR: ${LIB_DIR} exists but is not a forge-std checkout (no package.json)." >&2
    echo "       Refusing to touch it. Remove or fix it manually, then re-run." >&2
    exit 1
  fi
  FOUND_VERSION="$(pkg_version "${LIB_DIR}")"
  if [ "${FOUND_VERSION}" != "${EXPECTED_VERSION}" ]; then
    echo "ERROR: existing forge-std version '${FOUND_VERSION}' != pinned '${EXPECTED_VERSION}'." >&2
    echo "       Refusing to overwrite local modifications. Resolve manually." >&2
    exit 1
  fi
  echo "OK: forge-std v${EXPECTED_VERSION} already present at ${LIB_DIR} (left untouched)."
  exit 0
fi

# --- Case 2: absent -> clone at the pinned commit into a temp dir, verify, then install atomically. ---
command -v git >/dev/null 2>&1 || { echo "ERROR: git is required." >&2; exit 1; }

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "${TMP_DIR}"; }
trap cleanup EXIT

echo "Cloning forge-std @ ${PINNED_COMMIT} ..."
git -C "${TMP_DIR}" init -q
git -C "${TMP_DIR}" remote add origin "${REPO_URL}"
# Fetch the exact pinned commit only (fails closed if the pin is unreachable/wrong).
git -C "${TMP_DIR}" fetch -q --depth 1 origin "${PINNED_COMMIT}"
git -C "${TMP_DIR}" checkout -q FETCH_HEAD

CHECKED_OUT="$(git -C "${TMP_DIR}" rev-parse HEAD)"
if [ "${CHECKED_OUT}" != "${PINNED_COMMIT}" ]; then
  echo "ERROR: checked-out commit ${CHECKED_OUT} != pinned ${PINNED_COMMIT}. Aborting." >&2
  exit 1
fi
CLONE_VERSION="$(pkg_version "${TMP_DIR}")"
if [ "${CLONE_VERSION}" != "${EXPECTED_VERSION}" ]; then
  echo "ERROR: cloned forge-std version '${CLONE_VERSION}' != expected '${EXPECTED_VERSION}'. Aborting." >&2
  exit 1
fi

# Strip .git so the installed copy is a plain (gitignored) directory, matching repo convention.
rm -rf "${TMP_DIR}/.git"
mkdir -p "${CONTRACTS_DIR}/lib"
mv "${TMP_DIR}" "${LIB_DIR}"
trap - EXIT # installed dir is now LIB_DIR, not TMP_DIR

echo "OK: installed forge-std v${EXPECTED_VERSION} (commit ${PINNED_COMMIT}) at ${LIB_DIR}."
