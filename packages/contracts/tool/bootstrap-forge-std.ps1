<#
.SYNOPSIS
  Reproducibly install the PINNED forge-std into the gitignored packages/contracts/lib/forge-std
  on a fresh clone. TASK 10K-6 (Windows/PowerShell companion to bootstrap-forge-std.sh).

.DESCRIPTION
  Guarantees:
    * Pins the exact commit (v1.9.7) so a fresh clone gets byte-identical test tooling.
    * Verifies the checked-out commit AND package version; REFUSES (throws) on any mismatch.
    * NEVER overwrites an existing lib/forge-std (protects local modifications) — it only verifies.
    * Contains no secrets, no keys, no credentials; performs no broadcast/deploy/signing.

.EXAMPLE
  powershell -NoProfile -File packages/contracts/tool/bootstrap-forge-std.ps1
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'

$PinnedCommit   = '77041d2ce690e692d6e03cc812b57d1ddaa4d505'
$ExpectedVersion = '1.9.7'
$RepoUrl        = 'https://github.com/foundry-rs/forge-std.git'

$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$ContractsDir = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$LibDir       = Join-Path (Join-Path $ContractsDir 'lib') 'forge-std'

function Get-PkgVersion([string]$Dir) {
    $pkg = Join-Path $Dir 'package.json'
    if (-not (Test-Path $pkg)) { return $null }
    $line = Select-String -Path $pkg -Pattern '"version"' | Select-Object -First 1
    if ($null -eq $line) { return $null }
    if ($line.Line -match '"version"\s*:\s*"([^"]+)"') { return $Matches[1] }
    return $null
}

# --- Case 1: forge-std already present -> verify only, never overwrite. ---
if (Test-Path $LibDir) {
    if (-not (Test-Path (Join-Path $LibDir 'package.json'))) {
        throw "ERROR: $LibDir exists but is not a forge-std checkout (no package.json). Refusing to touch it."
    }
    $found = Get-PkgVersion $LibDir
    if ($found -ne $ExpectedVersion) {
        throw "ERROR: existing forge-std version '$found' != pinned '$ExpectedVersion'. Refusing to overwrite local modifications."
    }
    Write-Host "OK: forge-std v$ExpectedVersion already present at $LibDir (left untouched)."
    return
}

# --- Case 2: absent -> clone at the pinned commit into a temp dir, verify, install atomically. ---
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'ERROR: git is required.' }

$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ('forge-std-' + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $TmpDir | Out-Null
try {
    Write-Host "Cloning forge-std @ $PinnedCommit ..."
    git -C $TmpDir init -q
    git -C $TmpDir remote add origin $RepoUrl
    # Fetch the exact pinned commit only (fails closed if the pin is unreachable/wrong).
    git -C $TmpDir fetch -q --depth 1 origin $PinnedCommit
    if ($LASTEXITCODE -ne 0) { throw "ERROR: could not fetch pinned commit $PinnedCommit." }
    git -C $TmpDir checkout -q FETCH_HEAD
    if ($LASTEXITCODE -ne 0) { throw 'ERROR: checkout of pinned commit failed.' }

    $checkedOut = (git -C $TmpDir rev-parse HEAD).Trim()
    if ($checkedOut -ne $PinnedCommit) {
        throw "ERROR: checked-out commit $checkedOut != pinned $PinnedCommit. Aborting."
    }
    $cloneVersion = Get-PkgVersion $TmpDir
    if ($cloneVersion -ne $ExpectedVersion) {
        throw "ERROR: cloned forge-std version '$cloneVersion' != expected '$ExpectedVersion'. Aborting."
    }

    # Strip .git so the installed copy is a plain (gitignored) directory, matching repo convention.
    Remove-Item -Recurse -Force (Join-Path $TmpDir '.git')
    $libParent = Join-Path $ContractsDir 'lib'
    if (-not (Test-Path $libParent)) { New-Item -ItemType Directory -Path $libParent | Out-Null }
    Move-Item -Path $TmpDir -Destination $LibDir
    Write-Host "OK: installed forge-std v$ExpectedVersion (commit $PinnedCommit) at $LibDir."
}
catch {
    if (Test-Path $TmpDir) { Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue }
    throw
}
