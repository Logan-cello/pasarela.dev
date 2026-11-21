# Donate Plaza · Stellar / Soroban MVP

Demo tipo **PLS DONATE**: carteles clicables que pagan un token Soroban a su receptor y escriben un registro de donación on-chain. Está preparado para Stellar Testnet.

## Arquitectura

- `contracts/donate_gateway`: contrato Rust `no_std`, compilado a `wasm32-unknown-unknown`.
- `Sign`: propietario, receptor, título, hasta 8 montos y estado activo.
- `Donation`: donante, receptor, cartel, monto, token, mensaje, ledger y timestamp.
- El contrato integra cualquier token Soroban compatible con la interfaz `soroban_sdk::token` (incluido un Stellar Asset Contract/SAC). La operación `donate` hace un `transfer` anidado con la autorización del donante, por lo que la demo requiere una sola firma.
- `frontend`: Vite + Stellar SDK; plaza interactiva, Freighter, lectura RPC, simulación, firma y envío.

## Requisitos

Rust estable, `rustup target add wasm32-unknown-unknown`, Node 18+, [Stellar CLI](https://developers.stellar.org/docs/tools/stellar-cli), una wallet Freighter y una identidad de Testnet con fondos.

## Build y tests

```bash
rustup target add wasm32-unknown-unknown
cargo test
cargo build --target wasm32-unknown-unknown --release
```

El WASM queda en `target/wasm32-unknown-unknown/release/donate_gateway.wasm`.

## Despliegue Testnet paso a paso

```bash
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet
stellar contract asset deploy --asset native --source deployer --network testnet
```

Copia el contrato de token que imprime el último comando como `TOKEN_ID`. La ruta de automatización es:

```bash
# Linux/macOS/Git Bash
TOKEN_ID=C... ./scripts/deploy-testnet.sh

# PowerShell
$env:TOKEN_ID='C...'; .\scripts\deploy-testnet.ps1
```

Los scripts compilan, despliegan, inicializan el gateway y crean el cartel `Cafe del Barrio`. Guardan el resultado en `deployments/testnet.json` (`gateway`, `token`, `admin`, `rpc`), que puedes pegar en el formulario del frontend. Para una prueba de pago con SAC nativo, asegúrate de que la cuenta donante tenga XLM Testnet. Para un token custom, acuña/asigna saldo antes de pagar según la interfaz de ese token.

> Los nombres exactos de subcomandos pueden variar entre versiones de Stellar CLI. Comprueba `stellar contract deploy --help` y `stellar contract asset deploy --help`; no uses una clave real en Testnet.

También se puede hacer manualmente:

```bash
cargo build --target wasm32-unknown-unknown --release
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/donate_gateway.wasm --source deployer --network testnet
stellar contract invoke --id GATEWAY --source deployer --network testnet -- initialize --admin $(stellar keys address deployer) --token TOKEN_ID
stellar contract invoke --id GATEWAY --source deployer --network testnet -- create_sign --owner $(stellar keys address deployer) --receiver G... --title 'Mi puesto' --amounts '[100,500,1000]'
```

## Ejecutar la demo local

```bash
cd frontend
npm install
npm run dev
```

Abre `http://127.0.0.1:5173`. **No abras `frontend/index.html` ni `frontend/dist/index.html` con doble clic (`file://`)**: los módulos ES y las llamadas a Soroban requieren un servidor HTTP.

Para revisar el build de producción:

```bash
npm run build
npm run preview     # http://127.0.0.1:4173
```

El CSS se carga con `<link rel="stylesheet" href="./src/style.css">` en `index.html` (independiente del JS) y `vite.config.js` usa `base: './'`, así que el build funciona servido desde cualquier subcarpeta.

Con la app abierta, instala/desbloquea Freighter en **Testnet**, pega el `GATEWAY`, conecta la wallet y edita el campo (o recarga) para leer carteles. Pulsa un monto, escribe un mensaje y firma. El frontend simula contra `https://soroban-testnet.stellar.org`, firma con Freighter, envía y consulta el historial.

Para producción de una demo compartida, añade más carteles con `create_sign` y cambia el RPC desde el campo de configuración. Los montos son unidades base del token (SAC nativo usa 7 decimales).

## Modelo y seguridad del MVP

- `initialize` es único; el token queda fijado y no puede cambiarse accidentalmente.
- Solo el propietario del cartel puede activar/desactivar su cartel.
- Donaciones no aceptan importes negativos, títulos vacíos, mensajes de más de 180 bytes ni más de 8 presets.
- El contrato no custodia fondos: transfiere directamente del donante al receptor.
- Para un entorno real añadiría paginación, límites de almacenamiento, eventos indexables, administración multi-firma y una UI que compruebe la red antes de firmar.
