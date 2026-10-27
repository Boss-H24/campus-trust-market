. (Join-Path $PSScriptRoot 'common.ps1')
$taskAsciiRoot=Get-TaskAsciiRoot
$mysqlAdmin=Join-Path $taskAsciiRoot '.tools/mysql-8.4.13-winx64/bin/mysqladmin.exe'
$credentials=Join-Path $taskAsciiRoot '.runtime/mysql-admin.cnf'
if (-not (Test-Path -LiteralPath $credentials)) { throw 'Local database admin configuration missing' }
& $mysqlAdmin "--defaults-extra-file=$credentials" shutdown
if ($LASTEXITCODE -ne 0) { throw 'Database shutdown failed' }
