$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$keyDirectory = Join-Path $env:USERPROFILE '.tauri/pocket-lens'
$privatePath = Join-Path $keyDirectory 'updater.key'
$passwordPath = Join-Path $keyDirectory 'updater-password.dpapi'
New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null
if (-not (Test-Path -LiteralPath $privatePath)) {
    if (Test-Path -LiteralPath $passwordPath) { throw 'Incomplete signing backup; restore the private key before continuing.' }
    $passwordBytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $signingPassword = [Convert]::ToBase64String($passwordBytes)
    $protectedPassword = ConvertTo-SecureString -String $signingPassword -AsPlainText -Force
    $protectedPassword | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordPath -Encoding utf8
    & node (Join-Path $projectRoot 'node_modules/@tauri-apps/cli/tauri.js') signer generate --ci --password $signingPassword --write-keys $privatePath 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Signing key generation failed. No key material has been printed.' }
} else {
    if (-not (Test-Path -LiteralPath $passwordPath)) { throw 'Restore the DPAPI password backup before using the existing signing key.' }
    $protectedPassword = Get-Content -LiteralPath $passwordPath -Raw | ConvertTo-SecureString
    $signingPassword = [System.Net.NetworkCredential]::new('', $protectedPassword).Password
}
Get-Content -LiteralPath $privatePath -Raw | & gh secret set TAURI_SIGNING_PRIVATE_KEY --repo Beldi13/pocket-lens
if ($LASTEXITCODE -ne 0) { throw 'Could not store the signing key in GitHub Secrets.' }
$signingPassword | & gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo Beldi13/pocket-lens
if ($LASTEXITCODE -ne 0) { throw 'Could not store the signing password in GitHub Secrets.' }
$publicKey = (Get-Content -LiteralPath "$privatePath.pub" -Raw).Trim()
Set-Content -LiteralPath (Join-Path $projectRoot 'src-tauri/updater.pub') -Value $publicKey -Encoding utf8
$configPath = Join-Path $projectRoot 'src-tauri/tauri.conf.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable
$config.bundle.createUpdaterArtifacts = $true
$config.plugins = @{ updater = @{ pubkey = $publicKey; endpoints = @('https://github.com/Beldi13/pocket-lens/releases/latest/download/latest.json'); requireSignedVersion = $true; allowDowngrades = $false; windows = @{ installMode = 'passive' } } }
$config | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $configPath -Encoding utf8
$signingPassword = $null
Write-Output 'Updater signing configured. Private encrypted key and user-bound DPAPI password backup remain outside the repository.'
