# AGENTS.md

Guía permanente para agentes que trabajen en este repositorio. El estado
detallado y las tareas viven en `TASKS.md`; este archivo solo contiene reglas
durables, arquitectura y comandos.

## Proyecto

Demo de pasarela de donaciones tipo PLS DONATE sobre **Stellar Testnet**, con
contrato **Soroban** en Rust y frontend Vite + Stellar SDK + Freighter. Los
usuarios donan un token Soroban a "carteles" (puestos) y cada donación queda
registrada on-chain con mensaje, ledger y timestamp.

## Estructura

```
Cargo.toml                     # workspace + perfil release + versiones fijadas
Cargo.lock                     # debe versionarse (builds reproducibles)
contracts/donate_gateway/       # contrato Soroban (no_std, cdylib)
  Cargo.toml
  src/lib.rs                   # contrato + tests #[cfg(test)]
frontend/
  index.html                   # <link rel="stylesheet" href="./src/style.css">
  package.json
  vite.config.js               # base: './'
  src/main.js                  # UI, Freighter, RPC
  src/style.css
scripts/
  deploy-testnet.sh            # despliegue + init + cartel ejemplo
  deploy-testnet.ps1
deployments/testnet.json       # salida de los scripts (generado; no existe aún)
TASKS.md                       # estado y traspaso
```

## Stack y versiones

- Rust + `soroban-sdk = "=22.0.0"` (fijado con `=`). **No subir a 22.0.11**:
  arrastra `ed25519-dalek 3.x`, incompatible con `rand_chacha 0.3.1` de
  `soroban-env-host` y rompe `cargo test`.
- `ed25519-dalek = "=2.2.0"` como dev-dependency del contrato (resuelve el host
  de tests).
- Target: `wasm32-unknown-unknown`.
- Frontend: Vite 6, JS ES modules, `@stellar/stellar-sdk` 13,
  `@stellar/freighter-api` 2.
- Red: Stellar Testnet (`https://soroban-testnet.stellar.org`).

## Reglas de código

### Contrato

- Mantener `#![no_std]` y `crate-type = ["cdylib"]`.
- No usar `std`, ni `format!`, ni `vec!`/`String` de std; usar los tipos de
  `soroban_sdk` (`Vec`, `String`, `Map`, `Bytes`).
- Toda función de escritura que actúe sobre un cartel debe:
  1. `owner.require_auth()`,
  2. cargar el cartel,
  3. comparar `sign.owner == owner` y devolver `Error::Unauthorized` si no.
- Validar siempre en el contrato, no solo en el frontend: montos > 0, presets
  únicos (1–8), rango custom `min > 0 && max >= min`, mensaje ≤ 180 bytes.
- El contrato no custodia fondos: `token::Client::transfer(donor, receiver)`.
- No escanear todo el almacenamiento: usar índices por cartel/donante y acotar
  con `MAX_HISTORY = 50`.
- Nuevos errores: añadir variante con código numérico nuevo, sin reutilizar
  códigos existentes (el frontend y los tests comparan códigos).

Códigos actuales: `1 NotInitialized`, `2 InvalidAmount`, `3 InvalidTitle`,
`4 InvalidAmounts`, `5 SignNotFound`, `6 SignInactive`, `7 WrongToken`,
`8 Unauthorized`, `9 InvalidCustomRange`, `10 InvalidMessage`,
`11 InvalidLimit` (sin uso).

### Tests

- Los clientes generados por Soroban **no devuelven `Result`**: no usar
  `.unwrap()` sobre `create_sign`, `donate`, `get_sign`, etc.
- Para errores usar `#[should_panic(expected = "Error(Contract, #N)")]`
  (formato real del host, no `ContractError(N)`).
- Registrar contratos con `env.register(Contract, ())`, no
  `env.register_contract(None, ...)` (deprecado).
- Token de prueba: `MockToken` definido dentro de `#[cfg(test)]` con
  `mint`/`balance`/`transfer`.

### Frontend

- CSS se carga con `<link>` en `index.html`; **no** reañadir
  `import './style.css'` (el CSS debe sobrevivir a fallos del JS).
- Mantener `base: './'` en `vite.config.js` para que `dist/` use rutas
  relativas.
- `main.js` se ejecuta con `init()` que verifica los `id` requeridos; si se
  añade un elemento nuevo al HTML, agregarlo a `requiredIds`.
- Cualquier llamada Soroban usa `networkPassphrase: Networks.TESTNET` y la
  cuenta conectada como source. No usar cuentas aleatorias.
- La UI habla español; el código (variables/funciones) en inglés.
- Escapar texto proveniente del contrato antes de insertarlo con `innerHTML`
  (`escapeHtml`).
- No abrir `index.html` con `file://`: los módulos ES y Soroban requieren HTTP.

## Comandos

### Contrato

```bash
rustup target add wasm32-unknown-unknown
cargo test
cargo build --target wasm32-unknown-unknown --release
```

WASM: `target/wasm32-unknown-unknown/release/donate_gateway.wasm`.

Si `cargo` no está en PATH en Windows:
`& "$env:USERPROFILE\.cargo\bin\cargo.exe" ...`

### Frontend

```bash
cd frontend
npm install
npm run build
npm run dev        # http://127.0.0.1:5173
npm run preview    # http://127.0.0.1:4173
```

### Despliegue Testnet

```bash
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet
stellar contract asset deploy --asset native --source deployer --network testnet
TOKEN_ID=C... ./scripts/deploy-testnet.sh
```

```powershell
$env:TOKEN_ID='C...'; .\scripts\deploy-testnet.ps1
```

Los scripts escriben `deployments/testnet.json` con `gateway`, `token`, `admin`
y `rpc`. Ese valor `gateway` es el que se pega en el frontend.

## Convenciones de Git

- No hacer `commit` ni `push` salvo petición explícita.
- Antes de commitear: `cargo test`, build WASM, `npm run build` y `git status`.
- Versionar `Cargo.lock` y `frontend/package-lock.json`.
- No versionar `target/`, `frontend/dist/`, `frontend/node_modules/`, `*.wasm`
  ni `.env`.

## Trampas conocidas

- PowerShell trata los mensajes de progreso de `cargo` (stderr) como error de
  comando; el resultado real está en la línea `test result: ok`.
- `soroban-sdk` con `~22.0` resuelve versiones incompatibles: mantener `=`.
- Los montos son unidades base del token (SAC nativo: 7 decimales); la UI no
  formatea decimales todavía.
- `test_snapshots/` lo genera `cargo test`; no debe trackearse.
- Freighter debe estar en Testnet; el frontend valida `networkPassphrase`.
