. (Join-Path $PSScriptRoot 'common.ps1')
$taskAsciiRoot = Get-TaskAsciiRoot
$mysqlBase = Join-Path $taskAsciiRoot '.tools/mysql-8.4.13-winx64'
$mysqld = Join-Path $mysqlBase 'bin/mysqld.exe'
$mysql = Join-Path $mysqlBase 'bin/mysql.exe'
$data = Join-Path $taskAsciiRoot '.runtime/mysql-data'
$ini = Join-Path $taskAsciiRoot '.runtime/mysql.ini'
if (-not (Test-Path -LiteralPath $mysqld)) { throw 'Run scripts/setup.ps1 first' }
New-Item -ItemType Directory -Force -Path '.runtime' | Out-Null
$settings = @{}
foreach ($line in Get-Content -LiteralPath '.env' -Encoding UTF8) { if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$matches[1]]=$matches[2] } }
if ($settings['DB_HOST'] -ne '127.0.0.1' -or $settings['DB_PORT'] -ne '3307') { throw 'Portable MySQL uses 127.0.0.1:3307. For your own server, skip start-db and run migrations directly.' }
$taskClient = [Net.Sockets.TcpClient]::new()
try { $taskClient.Connect('127.0.0.1',3307); Write-Output 'Database port 3307 is already listening; migrations will verify credentials.'; return } catch {} finally { $taskClient.Dispose() }
$configuration = @"
[mysqld]
basedir=$($mysqlBase.Replace('\','/'))
datadir=$($data.Replace('\','/'))
port=3307
bind-address=127.0.0.1
mysqlx=0
character-set-server=utf8mb4
collation-server=utf8mb4_0900_ai_ci
default-time-zone=+00:00
log-error=$((Join-Path $taskAsciiRoot '.runtime/mysql-error.log').Replace('\','/'))
"@
[IO.File]::WriteAllText($ini,$configuration,(New-Object Text.UTF8Encoding $false))
$fresh = -not (Test-Path -LiteralPath (Join-Path $data 'mysql'))
if ($fresh) {
    & $mysqld "--defaults-file=$ini" --initialize-insecure --console 2>&1 | ForEach-Object { "$($_)" } | Set-Content -LiteralPath '.runtime/mysql-initialize.log'
    if ($LASTEXITCODE -ne 0) { throw 'MySQL initialization failed; see .runtime/mysql-initialize.log' }
}
$process = Start-Process -FilePath $mysqld -ArgumentList "`"--defaults-file=$ini`"" -WindowStyle Hidden -PassThru -WorkingDirectory $TaskRoot
$process.Id | Set-Content -LiteralPath '.runtime/mysql.pid'
$ready=$false
for ($i=0; $i -lt 60; $i++) {
    $taskProbe = [Net.Sockets.TcpClient]::new()
    try { $taskProbe.Connect('127.0.0.1',3307); $ready=$true; break } catch { Start-Sleep -Milliseconds 500 } finally { $taskProbe.Dispose() }
}
if (-not $ready) { throw 'MySQL did not start; see .runtime/mysql-error.log' }
if ($fresh) {
    $rootBytes=New-Object byte[] 32; $rng=[Security.Cryptography.RandomNumberGenerator]::Create();try{$rng.GetBytes($rootBytes)}finally{$rng.Dispose()}
    $rootPassword=($rootBytes|ForEach-Object{$_.ToString('x2')}) -join ''
    $dbPassword=$settings['DB_PASSWORD']
    if ($dbPassword -notmatch '^[a-fA-F0-9]+$') { throw 'Portable bootstrap expects the generated hexadecimal DB_PASSWORD' }
    $sql = "CREATE DATABASE IF NOT EXISTS campus_market CHARACTER SET utf8mb4; CREATE DATABASE IF NOT EXISTS campus_market_test CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS 'campus'@'127.0.0.1' IDENTIFIED BY '$dbPassword'; GRANT ALL ON campus_market.* TO 'campus'@'127.0.0.1'; GRANT ALL ON campus_market_test.* TO 'campus'@'127.0.0.1'; ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPassword';"
    $sql | & $mysql --protocol=TCP --host=127.0.0.1 --port=3307 --user=root --default-character-set=utf8mb4
    if ($LASTEXITCODE -ne 0) { throw 'Database bootstrap failed' }
    [IO.File]::WriteAllText((Join-Path $TaskRoot '.runtime/mysql-admin.cnf'),"[client]`nuser=root`npassword=$rootPassword`nhost=127.0.0.1`nport=3307`nprotocol=TCP`n",(New-Object Text.UTF8Encoding $false))
}
Write-Output 'Portable MySQL ready at 127.0.0.1:3307 (no Windows service installed).'
