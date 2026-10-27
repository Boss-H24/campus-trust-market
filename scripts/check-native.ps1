param([Parameter(Mandatory=$true)][string]$DevToolsPath)
. (Join-Path $PSScriptRoot 'common.ps1')
$compiler=Join-Path $DevToolsPath 'resources/app.asar.unpacked/node_modules/wcc-exec'
if(-not (Test-Path -LiteralPath (Join-Path $compiler 'wcc.exe'))) { throw 'Installed WeChat native compiler not found' }
New-Item -ItemType Directory -Force -Path '.artifacts' | Out-Null
Push-Location -LiteralPath 'miniprogram'
try {
    $wxmlFiles=@(Get-ChildItem -LiteralPath 'pages' -Filter '*.wxml' -Recurse | ForEach-Object { (Resolve-Path -LiteralPath $_.FullName -Relative).Replace('\','/') })
    & (Join-Path $compiler 'wcc.exe') -d -o '../.artifacts/native-wxml.js' @wxmlFiles
    if($LASTEXITCODE -ne 0) { throw 'Native WXML compilation failed' }
    $cssFiles=@('app.wxss')+@(Get-ChildItem -LiteralPath 'pages' -Filter '*.wxss' -Recurse | ForEach-Object { (Resolve-Path -LiteralPath $_.FullName -Relative).Replace('\','/') })
    $index=0
    foreach($cssFile in $cssFiles) {
        & (Join-Path $compiler 'wcsc.exe') -o "../.artifacts/native-style-$index.js" $cssFile
        if($LASTEXITCODE -ne 0) { throw "Native WXSS compilation failed: $cssFile" }
        $index++
    }
    Write-Output "Native WeChat compilers passed: $($wxmlFiles.Count) WXML pages, $($cssFiles.Count) WXSS files."
} finally { Pop-Location }
