#!/usr/bin/env bash
set -euo pipefail

# Requires: stellar CLI, rustup target wasm32-unknown-unknown, and a funded identity.
# stellar keys generate deployer --network testnet
# stellar keys fund deployer --network testnet

NETWORK=testnet
IDENTITY=${IDENTITY:-deployer}
WASM=target/wasm32-unknown-unknown/release/donate_gateway.wasm

cargo build --target wasm32-unknown-unknown --release
CONTRACT_ID=$(stellar contract deploy --wasm "$WASM" --source "$IDENTITY" --network "$NETWORK")
echo "GATEWAY_CONTRACT=$CONTRACT_ID"

echo "Deploy or choose a Soroban token (SAC) and set TOKEN_ID. Example:"
echo "  stellar contract asset deploy --asset native --source $IDENTITY --network $NETWORK"
: "${TOKEN_ID:?Set TOKEN_ID to a deployed SAC/token contract address}"

stellar contract invoke --id "$CONTRACT_ID" --source "$IDENTITY" --network "$NETWORK" -- initialize \
  --admin "$(stellar keys address "$IDENTITY")" --token "$TOKEN_ID"

# Create a first sign. Amounts are token base units (e.g. 100 = 0.00001 XLM for 7 decimals).
stellar contract invoke --id "$CONTRACT_ID" --source "$IDENTITY" --network "$NETWORK" -- create_sign \
  --owner "$(stellar keys address "$IDENTITY")" --receiver "$(stellar keys address "$IDENTITY")" \
  --title "Café del Barrio" --amounts '[100,500,1000]'

echo "Copy the gateway address into frontend/index.html or the Gateway contract field."
