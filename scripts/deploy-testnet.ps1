$ErrorActionPreference = 'Stop'

# Despliega el gateway en Stellar Testnet (Windows / PowerShell).
# Uso:
#   $env:TOKEN_ID='C...'; .\scripts\deploy-testnet.ps1
#   $env:IDENTITY='deployer'; $env:TOKEN_ID='C...'; .\scripts\deploy-testnet.ps1

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Network = if ($env:NETWORK) { $env:NETWORK } else { 'testnet' }
if ($Network -ne 'testnet') { throw "Este script solo despliega en Stellar Testnet; NETWORK recibido: '$Network'." }
$Identity = if ($env:IDENTITY) { $env:IDENTITY } else { 'deployer' }
$Token = $env:TOKEN_ID
$Wasm = 'target/wasm32-unknown-unknown/release/donate_gateway.wasm'
$OutDir = 'deployments'

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'cargo no esta en PATH.' }
if (-not (Get-Command stellar -ErrorAction SilentlyContinue)) { throw 'Stellar CLI no esta en PATH.' }
if (-not $Token) { throw 'Define TOKEN_ID con la direccion del token Soroban/SAC antes de desplegar.' }

Write-Host '==> Compilando contrato (wasm32-unknown-unknown, release)'
cargo build --target wasm32-unknown-unknown --release
if (-not (Test-Path $Wasm)) { throw "No se genero $Wasm" }

Write-Host "==> Desplegando gateway en $Network"
$gateway = (stellar contract deploy --wasm $Wasm --source $Identity --network $Network | Select-Object -Last 1).Trim()
if (-not $gateway -or -not $gateway.StartsWith('C')) {
  throw "Respuesta inesperada de stellar contract deploy: '$gateway'"
}

$admin = (stellar keys address $Identity | Select-Object -Last 1).Trim()
Write-Host "==> Gateway: $gateway"
Write-Host "==> Admin:   $admin"

Write-Host "==> Inicializando con token $Token"
stellar contract invoke --id $gateway --source $Identity --network $Network -- initialize --admin $admin --token $Token

# Los montos son unidades base del token (SAC nativo usa 7 decimales).
Write-Host '==> Creando cartel de ejemplo'
stellar contract invoke --id $gateway --source $Identity --network $Network -- create_sign --owner $admin --receiver $admin --title 'Cafe del Barrio' --amounts '[100,500,1000]'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$deployment = [ordered]@{
  network    = $Network
  rpc        = 'https://soroban-testnet.stellar.org'
  gateway    = $gateway
  token      = $Token
  admin      = $admin
  deployedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
}
$deployment | ConvertTo-Json | Set-Content -Path (Join-Path $OutDir 'testnet.json') -Encoding UTF8

Write-Host ''
Write-Host "Listo. Datos guardados en $OutDir/testnet.json"
Write-Host "GATEWAY_CONTRACT=$gateway"
Write-Host 'Abre http://127.0.0.1:5173 (npm run dev en frontend/) y pega el gateway.'
