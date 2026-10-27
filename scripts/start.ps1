. (Join-Path $PSScriptRoot 'common.ps1')
& (Join-Path $PSScriptRoot 'start-db.ps1')
Invoke-TaskNpm run dev
