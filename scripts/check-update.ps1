# Builds and exercises two signed, isolated installer fixtures. Never uses the release key.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
$fixture = [IO.Path]::GetFullPath((Join-Path $root '.cache/update-install-check'))
if (!$fixture.StartsWith((Join-Path $root '.cache') + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid fixture location' }
New-Item -ItemType Directory -Force -Path $fixture | Out-Null
Set-Content -LiteralPath "$fixture/authorized-fixture" -Value 'isolated updater acceptance'
$keyBefore = $env:TAURI_SIGNING_PRIVATE_KEY
$passwordBefore = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
$checkBefore = $env:POCKET_LENS_UPDATE_CHECK
$server = $null
try {
    & node node_modules/@tauri-apps/cli/tauri.js signer generate --ci --password '' --write-keys "$fixture/test.key" *> "$fixture/key-generation.log"
    if ($LASTEXITCODE -ne 0) { throw 'Fixture key generation failed' }
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw -LiteralPath "$fixture/test.key"
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
    $pub = (Get-Content -Raw -LiteralPath "$fixture/test.key.pub").Trim()
    foreach ($version in @('0.3.1', '0.3.0')) {
        $config = @{
            productName = 'Pocket Lens Update Check'; identifier = 'dev.beldi.pocketlens.updatecheck'; version = $version
            app = @{ windows = @(@{ label = 'main'; title = 'Pocket Lens Update Check'; visible = $false }) }
            bundle = @{ createUpdaterArtifacts = $true; windows = @{ nsis = @{ displayLanguageSelector = $false } } }
            plugins = @{ updater = @{ pubkey = $pub; endpoints = @('http://127.0.0.1:18749/latest.json'); dangerousInsecureTransportProtocol = $true; requireSignedVersion = $true; windows = @{ installMode = 'quiet' } } }
        }
        $config | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath "$fixture/build.json"
        & npm run tauri build -- --ci --features diagnostics --config "$fixture/build.json"
        if ($LASTEXITCODE -ne 0) { throw "Fixture $version build failed" }
        $installer = Get-ChildItem 'src-tauri/target/release/bundle/nsis/*' -File | Where-Object { $_.Name -like "Pocket Lens Update Check_${version}_*.exe" } | Select-Object -First 1
        if (!$installer) { throw 'Fixture installer missing' }
        Copy-Item -LiteralPath $installer.FullName -Destination "$fixture/$version.exe"
        if ($version -eq '0.3.1') { Copy-Item -LiteralPath ($installer.FullName + '.sig') -Destination "$fixture/update.sig" }
        # Remove only these exact generated test artifacts from the production asset folder.
        Remove-Item -LiteralPath ($installer.FullName + '.sig')
        Remove-Item -LiteralPath $installer.FullName
    }
    @{ version = '0.3.1'; notes = 'Isolated signed installation check'; platforms = @{ 'windows-x86_64' = @{ url = 'http://127.0.0.1:18749/0.3.1.exe'; signature = (Get-Content -Raw "$fixture/update.sig").Trim() } } } | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 "$fixture/latest.json"
    $server = Start-Process -FilePath node -ArgumentList @('scripts/update-fixture-server.mjs', "`"$fixture`"") -PassThru -WindowStyle Hidden -RedirectStandardOutput "$fixture/server.log" -RedirectStandardError "$fixture/server-error.log"
    Start-Sleep -Seconds 2
    $install = Join-Path $fixture 'installed'
    $initial = Start-Process -FilePath "$fixture/0.3.0.exe" -ArgumentList @('/S', "/D=$install") -PassThru -WindowStyle Hidden -Wait
    if ($initial.ExitCode -ne 0) { throw 'Fixture baseline install failed' }
    $env:POCKET_LENS_UPDATE_CHECK = $fixture
    $baseline = Start-Process -FilePath "$install/pocket-lens.exe" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$fixture/baseline.log" -RedirectStandardError "$fixture/baseline-error.log"
    $deadline = (Get-Date).AddMinutes(4)
    while (!(Test-Path "$fixture/passed.json") -and !(Test-Path "$fixture/failed.txt") -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
    if (Test-Path "$fixture/failed.txt") { throw (Get-Content -Raw "$fixture/failed.txt") }
    if (!(Test-Path "$fixture/passed.json")) {
        $baseline.Refresh()
        Write-Output "Baseline exited: $($baseline.HasExited); data fixture: $(Test-Path "$fixture/before.json"); signature verified: $(Test-Path "$fixture/verified"); installed version: $((Get-Item "$install/pocket-lens.exe").VersionInfo.ProductVersion)"
        if (Test-Path "$fixture/baseline-error.log") { Get-Content -LiteralPath "$fixture/baseline-error.log" }
        throw 'Signed installer did not relaunch the updated fixture'
    }
    Get-Content -Raw "$fixture/passed.json"
    $uninstaller = Get-ChildItem -LiteralPath $install -Filter '*uninstall*.exe' | Select-Object -First 1
    if ($uninstaller) { Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -WindowStyle Hidden -Wait }
} finally {
    if ($server -and !$server.HasExited) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
    $env:TAURI_SIGNING_PRIVATE_KEY = $keyBefore
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $passwordBefore
    $env:POCKET_LENS_UPDATE_CHECK = $checkBefore
}
