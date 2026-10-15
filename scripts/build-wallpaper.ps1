$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = $env:ANDROID_HOME
if (-not $sdkRoot) { $sdkRoot = $env:ANDROID_SDK_ROOT }
if (-not $sdkRoot) { throw 'Set ANDROID_HOME to an Android SDK containing platform 35 and build-tools 35.0.0.' }
$androidJar = Join-Path $sdkRoot 'platforms/android-35/android.jar'
$d8Jar = Join-Path $sdkRoot 'build-tools/35.0.0/lib/d8.jar'
if (-not (Test-Path -LiteralPath $androidJar) -or -not (Test-Path -LiteralPath $d8Jar)) {
    throw 'Install platforms;android-35 and build-tools;35.0.0 using sdkmanager.'
}
$buildDirectory = Join-Path $projectRoot '.cache/wallpaper/classes'
$destination = Join-Path $projectRoot 'src-tauri/vendor/scrcpy/pocket-lens-wallpaper.jar'
New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
& javac --release 8 -classpath $androidJar -d $buildDirectory (Join-Path $projectRoot 'android/Wallpaper.java')
if ($LASTEXITCODE -ne 0) { throw 'Wallpaper helper Java compilation failed' }
& java -cp $d8Jar com.android.tools.r8.D8 --release --min-api 24 --lib $androidJar --output $destination (Join-Path $buildDirectory 'dev/beldi/pocketlens/Wallpaper.class')
if ($LASTEXITCODE -ne 0) { throw 'Wallpaper helper DEX compilation failed' }
Write-Output 'Built original Pocket Lens wallpaper helper (Android 7+; read-only).'
$filesDestination = Join-Path $projectRoot 'src-tauri/vendor/scrcpy/pocket-lens-files.jar'
& javac --release 8 -classpath $androidJar -d $buildDirectory (Join-Path $projectRoot 'android/Files.java')
if ($LASTEXITCODE -ne 0) { throw 'File helper Java compilation failed' }
& java -cp $d8Jar com.android.tools.r8.D8 --release --min-api 21 --lib $androidJar --output $filesDestination (Join-Path $buildDirectory 'dev/beldi/pocketlens/Files.class')
if ($LASTEXITCODE -ne 0) { throw 'File helper DEX compilation failed' }
Write-Output 'Built original Pocket Lens file helper (Android 5+; shared storage only).'
