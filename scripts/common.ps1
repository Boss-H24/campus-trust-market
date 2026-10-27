$ErrorActionPreference = 'Stop'
$TaskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $TaskRoot
function Get-TaskAsciiRoot {
    if ($TaskRoot -notmatch '[^\x00-\x7F]') { return $TaskRoot }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $suffix = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($TaskRoot))).Replace('-','').Substring(0,12)) } finally { $sha.Dispose() }
    $linkParent = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CampusTrustMarket'
    New-Item -ItemType Directory -Force -Path $linkParent | Out-Null
    $link = Join-Path $linkParent "workspace-$suffix"
    if (Test-Path -LiteralPath $link) {
        $existing = Get-Item -LiteralPath $link
        if ($existing.LinkType -ne 'Junction' -or $existing.Target -ne $TaskRoot) { throw 'ASCII workspace link belongs to another target' }
    } else { New-Item -ItemType Junction -Path $link -Value $TaskRoot | Out-Null }
    return $link
}
function Get-TaskNode {
    $local = Join-Path $TaskRoot '.tools/node/node.exe'
    if ((Test-Path -LiteralPath $local) -and ((& $local --version) -match '^v24\.')) { return $local }
    $installed = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($installed -and ((& $installed.Source --version) -match '^v24\.')) { return $installed.Source }
    throw 'Node.js 24 is missing. Run scripts/setup.ps1 first.'
}
function Invoke-TaskNpm {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
    $node = Get-TaskNode
    $npm = Join-Path $TaskRoot '.tools/npm/bin/npm-cli.js'
    $nodeDirectory = Split-Path -Parent $node
    $env:PATH = $nodeDirectory + ';' + $env:PATH
    & $node $npm @Arguments
    if ($LASTEXITCODE -ne 0) { throw "npm failed with code $LASTEXITCODE" }
}
