#!/usr/bin/env bash
set -euo pipefail

# Despliega el gateway en Stellar Testnet.
#
# Requisitos:
#   cargo (target wasm32-unknown-unknown instalado)
#   stellar CLI
#   una identidad financiada:  stellar keys generate deployer --network testnet
#                              stellar keys fund deployer --network testnet
#
# Uso:
#   TOKEN_ID=C... ./scripts/deploy-testnet.sh
#   IDENTITY=deployer TOKEN_ID=C... ./scripts/deploy-testnet.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NETWORK="${NETWORK:-testnet}"
IDENTITY="${IDENTITY:-deployer}"
WASM="target/wasm32-unknown-unknown/release/donate_gateway.wasm"
OUT_DIR="deployments"

if [[ "$NETWORK" != "testnet" ]]; then
  echo "ERROR: este script solo despliega en Stellar Testnet; NETWORK recibido: '$NETWORK'."
  exit 1
fi

command -v cargo >/dev/null 2>&1 || { echo "ERROR: cargo no está en PATH."; exit 1; }
command -v stellar >/dev/null 2>&1 || { echo "ERROR: Stellar CLI no está en PATH."; exit 1; }
: "${TOKEN_ID:?Define TOKEN_ID con la dirección del token Soroban/SAC (ej: TOKEN_ID=C... ./scripts/deploy-testnet.sh)}"

echo "==> Compilando contrato (wasm32-unknown-unknown, release)"
cargo build --target wasm32-unknown-unknown --release

if [[ ! -f "$WASM" ]]; then
  echo "ERROR: no se generó $WASM"
  exit 1
fi

echo "==> Desplegando gateway en $NETWORK"
GATEWAY_ID="$(stellar contract deploy --wasm "$WASM" --source "$IDENTITY" --network "$NETWORK" | tail -n 1 | tr -d '[:space:]')"

if [[ -z "$GATEWAY_ID" || "$GATEWAY_ID" != C* ]]; then
  echo "ERROR: respuesta inesperada de stellar contract deploy: '$GATEWAY_ID'"
  exit 1
fi

ADMIN="$(stellar keys address "$IDENTITY" | tr -d '[:space:]')"
echo "==> Gateway: $GATEWAY_ID"
echo "==> Admin:   $ADMIN"

echo "==> Inicializando con token $TOKEN_ID"
stellar contract invoke --id "$GATEWAY_ID" --source "$IDENTITY" --network "$NETWORK" -- initialize \
  --admin "$ADMIN" --token "$TOKEN_ID"

# Los montos son unidades base del token (SAC nativo usa 7 decimales).
echo "==> Creando cartel de ejemplo"
stellar contract invoke --id "$GATEWAY_ID" --source "$IDENTITY" --network "$NETWORK" -- create_sign \
  --owner "$ADMIN" --receiver "$ADMIN" \
  --title "Cafe del Barrio" --amounts '[100,500,1000]'

mkdir -p "$OUT_DIR"
cat > "$OUT_DIR/testnet.json" <<JSON
{
  "network": "testnet",
  "rpc": "https://soroban-testnet.stellar.org",
  "gateway": "$GATEWAY_ID",
  "token": "$TOKEN_ID",
  "admin": "$ADMIN",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

echo
echo "Listo. Datos guardados en $OUT_DIR/testnet.json"
echo "GATEWAY_CONTRACT=$GATEWAY_ID"
echo "Abre http://127.0.0.1:5173 (npm run dev en frontend/) y pega el gateway."
