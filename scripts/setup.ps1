param([switch]$SkipDownloads)
. (Join-Path $PSScriptRoot 'common.ps1')
$ProgressPreference = 'SilentlyContinue'
New-Item -ItemType Directory -Force -Path '.tools','.runtime' | Out-Null
function New-TaskSecret([int]$Length=32) {
    $bytes = New-Object byte[] $Length
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}
$taskNodePath = $null
try { $taskNodePath = Get-TaskNode } catch {}
if (-not $taskNodePath -or -not ((& $taskNodePath --version) -match '^v24\.')) {
    if ($SkipDownloads) { throw 'Node 24 is required' }
    New-Item -ItemType Directory -Force -Path '.tools/node' | Out-Null
    Invoke-WebRequest 'https://nodejs.org/dist/v24.19.0/win-x64/node.exe' -OutFile '.tools/node/node.exe' -UseBasicParsing
}
if (-not (Test-Path -LiteralPath '.tools/npm/bin/npm-cli.js')) {
    if ($SkipDownloads) { throw 'Local npm is missing' }
    $metadata = Invoke-RestMethod 'https://registry.npmjs.org/npm/12.2.1'
    Invoke-WebRequest $metadata.dist.tarball -OutFile '.tools/npm.tgz' -UseBasicParsing
    $algorithm = [Security.Cryptography.SHA512]::Create()
    try { $digest = [Convert]::ToBase64String($algorithm.ComputeHash([IO.File]::ReadAllBytes((Join-Path $TaskRoot '.tools/npm.tgz')))) } finally { $algorithm.Dispose() }
    if ($metadata.dist.integrity -ne "sha512-$digest") { throw 'npm archive integrity mismatch' }
    New-Item -ItemType Directory -Force -Path '.tools/npm' | Out-Null
    tar -xzf '.tools/npm.tgz' -C '.tools/npm' --strip-components=1
    if ($LASTEXITCODE -ne 0) { throw 'Unable to extract npm; Windows tar is required' }
}
$mysqlVersion = '8.4.13'
if (-not (Test-Path -LiteralPath ".tools/mysql-$mysqlVersion-winx64/bin/mysqld.exe")) {
    if ($SkipDownloads) { throw 'Local MySQL is missing' }
    Invoke-WebRequest "https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-$mysqlVersion-winx64.zip" -OutFile '.tools/mysql.zip' -UseBasicParsing
    if ((Get-FileHash '.tools/mysql.zip' -Algorithm MD5).Hash.ToLower() -ne '7b94489d5524dea9b27097068bea25a8') { throw 'MySQL archive integrity mismatch' }
    Expand-Archive -LiteralPath '.tools/mysql.zip' -DestinationPath '.tools' -Force
}
if (-not (Test-Path -LiteralPath '.env')) {
    $config = [IO.File]::ReadAllText((Join-Path $TaskRoot '.env.example'))
    $config = $config.Replace('REPLACE_WITH_LOCAL_PASSWORD',(New-TaskSecret 24)).Replace('REPLACE_WITH_LOCAL_DEMO_PASSWORD',(New-TaskSecret 12))
    $config = $config.Replace('ENCRYPTION_KEY=REPLACE_WITH_64_HEX_CHARACTERS',('ENCRYPTION_KEY='+(New-TaskSecret)))
    $config = $config.Replace('IDENTITY_HMAC_KEY=REPLACE_WITH_64_HEX_CHARACTERS',('IDENTITY_HMAC_KEY='+(New-TaskSecret)))
    [IO.File]::WriteAllText((Join-Path $TaskRoot '.env'),$config,(New-Object Text.UTF8Encoding $false))
}
if (Test-Path -LiteralPath 'package-lock.json') { Invoke-TaskNpm ci --no-audit --no-fund } else { Invoke-TaskNpm install --no-audit --no-fund }
& (Join-Path $PSScriptRoot 'start-db.ps1')
Invoke-TaskNpm run db:migrate
Invoke-TaskNpm run db:seed
Write-Output 'Setup complete. Run scripts/start.ps1; local demo password is in .env (DEMO_PASSWORD).'
