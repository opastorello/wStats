# Runs before `npm run installer` compiles the app (beforeBuildCommand in
# src-tauri/tauri.installer.conf.json): builds the sensor service and fetches the
# official, signed PawnIO setup that ships inside the installer.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

cargo build --release --manifest-path "$root\sensors\Cargo.toml"
if ($LASTEXITCODE) { exit $LASTEXITCODE }

# Pinned release, checked by hash and by signature.
$version = "2.2.0"
$sha256 = "1F519A22E47187F70A1379A48CA604981C4FCF694F4E65B734AAA74A9FBA3032"
$dir = "$root\src-tauri\installer"
$setup = "$dir\PawnIO_setup.exe"

if (-not (Test-Path $setup) -or (Get-FileHash $setup -Algorithm SHA256).Hash -ne $sha256) {
    Write-Host "Downloading PawnIO $version setup"
    Invoke-WebRequest "https://github.com/namazso/PawnIO.Setup/releases/download/$version/PawnIO_setup.exe" -OutFile $setup -UseBasicParsing
    if ((Get-FileHash $setup -Algorithm SHA256).Hash -ne $sha256) {
        Remove-Item $setup
        throw "PawnIO_setup.exe does not match the pinned SHA-256"
    }
}
if ((Get-AuthenticodeSignature $setup).Status -ne "Valid") {
    throw "PawnIO_setup.exe is not validly signed"
}
