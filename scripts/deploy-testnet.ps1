$ErrorActionPreference = 'Stop'
$Identity = if ($env:IDENTITY) { $env:IDENTITY } else { 'deployer' }
$Token = $env:TOKEN_ID
if (-not $Token) { throw 'Define TOKEN_ID with a deployed Soroban token/SAC contract address.' }
cargo build --target wasm32-unknown-unknown --release
$wasm = 'target/wasm32-unknown-unknown/release/donate_gateway.wasm'
$id = stellar contract deploy --wasm $wasm --source $Identity --network testnet
$address = stellar keys address $Identity
stellar contract invoke --id $id --source $Identity --network testnet -- initialize --admin $address --token $Token
stellar contract invoke --id $id --source $Identity --network testnet -- create_sign --owner $address --receiver $address --title 'Café del Barrio' --amounts '[100,500,1000]'
Write-Host "GATEWAY_CONTRACT=$id"
