# TASKS.md — Estado del proyecto Donate Plaza (PLS DONATE en Stellar/Soroban)

> Última actualización: **2026-11-20**.
> Este documento es el traspaso de contexto para una sesión nueva. Nada aquí debe
> considerarse terminado si no aparece con evidencia de verificación.

---

## 1. Objetivo general

Construir una demo funcional (MVP) de una pasarela de pagos inspirada en
**PLS DONATE** sobre **Stellar Testnet**:

- Cada "cartel" (sign/booth) define un creador, una dirección receptora, un
  título y uno o varios montos de donación.
- Un usuario dona un token Soroban a un cartel; la donación queda registrada
  on-chain (donante, receptor, cartel, monto, token, mensaje, ledger, timestamp).
- La demo web permite elegir un cartel, conectar Freighter en Testnet, firmar la
  donación y ver el historial y el total recaudado.

## 2. Arquitectura y tecnologías

### Contrato (on-chain)

- Ruta: `contracts/donate_gateway/` (crate `donate-gateway`).
- Rust `#![no_std]`, **soroban-sdk `=22.0.0`** (versión fijada), compilado a
  `wasm32-unknown-unknown`.
- Tipos públicos: `Sign`, `Donation`, `DataKey`, `Error`.
- Constante `MAX_HISTORY = 50` (límite de filas por consulta paginada).
- Token: dirección única configurada en `initialize`; se usa
  `soroban_sdk::token::Client` (`transfer`) → compatible con SAC y tokens
  Soroban que implementen la interfaz de token.
- El contrato no custodia fondos: transfiere directo donante → receptor.
- Workspace Cargo en la raíz; el perfil `release` vive solo en el `Cargo.toml`
  raíz (opt-level `z`, lto, codegen-units 1, panic abort).

### API del contrato (implementada)

| Función | Tipo | Notas |
|---|---|---|
| `initialize(admin, token)` | escritura | Solo una vez; fija admin y token |
| `create_sign(owner, receiver, title, amounts)` | escritura | `require_auth` del owner; 1–8 montos > 0, sin duplicados; 0 = deshabilitado |
| `create_sign_advanced(..., custom_enabled, custom_min, custom_max)` | escritura | Añade rango de monto personalizado |
| `set_sign_active(owner, sign_id, active)` | escritura | Solo el owner; si no, `Unauthorized` |
| `update_sign_amounts(owner, sign_id, amounts, custom_enabled, min, max)` | escritura | Solo el owner |
| `donate(donor, sign_id, amount, message)` | escritura | Valida activo, preset **o** rango custom; mensaje ≤ 180 bytes; transfiere y registra |
| `get_sign(sign_id)` | lectura | |
| `get_donation(donation_id)` | lectura | `Option` |
| `get_sign_total(sign_id)` | lectura | Total acumulado por cartel |
| `get_sign_donations(sign_id, offset, limit)` | lectura | Índice por cartel; `limit` se acota a 1..=50 |
| `get_donor_donations(donor, offset, limit)` | lectura | Índice por donante; `limit` acotado |
| `sign_count()`, `donation_count()`, `token()` | lectura | |

### Almacenamiento (DataKey)

- `instance`: `Admin`, `Token`, `SignCount`, `DonationCount`.
- `persistent`: `Sign(id)`, `SignTotal(id)`, `SignDonationCount(id)`,
  `SignDonation(sign_id, position)`, `DonorDonationCount(addr)`,
  `DonorDonation(addr, position)`, `Donation(id)`.
- Índices por cartel/donante guardan **IDs** (u32), no copias del registro.
- `Donation` se guarda una sola vez; los índices solo la referencian.

### Frontend (off-chain)

- Ruta: `frontend/` — Vite 6 + JS vanilla (sin framework) + `@stellar/stellar-sdk` 13
  + `@stellar/freighter-api` 2.
- Sale **una sola firma** por donación: simular → `assembleTransaction` →
  `signTransaction` → `sendTransaction` → polling con `getTransaction`.
- Configuración en caliente de `Gateway contract` y `RPC`
  (`https://soroban-testnet.stellar.org`); el gateway se persiste en
  `localStorage` (`donate-plaza:gateway`).
- Funciones UI: tarjetas de carteles con total recaudado, montos predefinidos,
  botón de monto personalizado cuando `custom_enabled`, filtro de historial por
  cartel o por donante, mensajes de error diferenciados
  (simulación / firma rechazada / red / RPC).
- CSS: `frontend/src/style.css`, cargado con `<link>` real desde `index.html`
  (no vía `import` en JS). `vite.config.js` usa `base: './'`.

### Scripts

- `scripts/deploy-testnet.sh` y `scripts/deploy-testnet.ps1`: resuelven la raíz
  del repo, validan `cargo`, `stellar` y `TOKEN_ID` **antes** de desplegar,
  compilan, despliegan, inicializan, crean un cartel de ejemplo y escriben
  `deployments/testnet.json`.

## 3. Funcionalidades implementadas (con estado de verificación)

Verificado el **2026-11-20** en este equipo:

- [x] Contrato Soroban completo (Fase 2) con auth de owner, presets, monto
      personalizado, totales e índices paginados. **Verificado:** `cargo test`
      → 13 tests OK; `cargo build --target wasm32-unknown-unknown --release` OK
      (WASM ~19.5 KB en `target/wasm32-unknown-unknown/release/donate_gateway.wasm`).
- [x] 13 tests unitarios: creación, montos inválidos/duplicados, donación con
      token mock, cartel inactivo, fuera de rango custom, update de owner,
      rechazo a terceros, rango custom inválido, historial acotado.
      Panics esperados usan el formato real `Error(Contract, #N)`.
- [x] Frontend: lectura de carteles/totales/historial, filtros, donación con
      Freighter, manejo de errores, aviso si se abre con `file://`.
      **Verificado:** `npm run build` OK (2026-11-20) y estilos computados
      correctos en navegador (dev `:5173` y preview `:4173`) el 2026-11-19.
- [x] CSS carga independiente del JS y build con rutas relativas.
      **Verificado** en navegador: `font-family` sans-serif, fondo
      `rgb(16,19,26)`, `main` con padding, sin overflow horizontal.
- [x] Scripts de despliegue reescritos y validados sintácticamente
      (PowerShell parser OK). **No ejecutados** (ver §7).

## 4. Archivos modificados recientemente (sin commit)

`git status` al 2026-11-20:

```
 M Cargo.toml
 M README.md
 M contracts/donate_gateway/Cargo.toml
 M contracts/donate_gateway/src/lib.rs
 M frontend/index.html
 M frontend/package.json
 M frontend/src/main.js
 M scripts/deploy-testnet.ps1
 M scripts/deploy-testnet.sh
?? Cargo.lock
?? contracts/donate_gateway/test_snapshots/
?? frontend/vite.config.js
?? package-lock.json
```

Cambios por archivo (respecto al último commit `28facc1`):

- `Cargo.toml`: versiones fijadas (`soroban-sdk = "=22.0.0"`,
  `ed25519-dalek = "=2.2.0"`), perfil release movido al workspace.
- `contracts/donate_gateway/Cargo.toml`: dev-dependency `ed25519-dalek`
  (necesaria para que resuelva `soroban-env-host` en tests), sin perfil duplicado.
- `contracts/donate_gateway/src/lib.rs`: índices y totales, monto custom,
  `update_sign_amounts`, `create_sign_advanced`, consultas paginadas, tests
  reescritos (13), `env.register(...)` en lugar de `register_contract`.
- `frontend/index.html`: `<link rel="stylesheet" href="./src/style.css">`,
  script `./src/main.js`, `meta color-scheme`.
- `frontend/src/main.js`: sin `import './style.css'`; `init()` con chequeo de
  IDs; requiere wallet para lecturas; localStorage del gateway; polling de
  transacción; errores más claros.
- `frontend/package.json`: script `preview`.
- `frontend/vite.config.js` (nuevo): `base: './'`, host/port de dev.
- `scripts/deploy-testnet.sh` / `.ps1`: validaciones previas, guardado de
  `deployments/testnet.json`, título ASCII (`Cafe del Barrio`).
- `README.md`: sección de ejecución local y rutas relativas.

## 5. Decisiones técnicas y por qué

1. **Token único por despliegue (SAC o token Soroban)**: simplifica la demo y
   evita mezclar denominaciones en un mismo contrato. El token se elige al
   inicializar.
2. **`transfer` directo en `donate` con auth del donante**: una sola firma en
   Freighter; sin depender de allowances ni de un segundo tx.
3. **Índices de IDs en `persistent` en lugar de escanear todo**: acota gas y
   lecturas; `MAX_HISTORY = 50` limita la respuesta.
4. **`owner` explícito en `require_auth` + comparación con `sign.owner`**: la
   autorización de Soroban no basta si el owner pasado no es el del cartel; se
   devuelve `Unauthorized`.
5. **Montos custom opt-in por cartel** (`custom_enabled`, `custom_min/max`):
   permite "monto libre" sin romper los presets; validado en contrato, no solo
   en UI.
6. **Versiones Cargo fijadas con `=`**: `soroban-sdk 22.0.x` arrastraba
   `ed25519-dalek 3.x`, incompatible con `rand_chacha 0.3.1` de
   `soroban-env-host` (error `ChaCha20Rng: CryptoRng not satisfied`). Fijar
   `soroban-sdk =22.0.0` + `ed25519-dalek =2.2.0` lo resuelve.
7. **CSS por `<link>` y no por `import` en JS**: si el módulo JS falla (file://,
   import roto, extensión ausente), el CSS debe seguir aplicándose.
8. **`base: './'` en Vite**: el build funciona servido desde cualquier
   subcarpeta; evita 404 de `/assets/...`.
9. **Lecturas con la cuenta de Freighter**: la simulación Soroban necesita una
   cuenta existente como source; se decidió pedir conexión antes de leer en
   lugar de usar una cuenta aleatoria inexistente.
10. **Scripts fallan antes de desplegar** si falta `TOKEN_ID`/`stellar`/wasm,
    para no dejar contratos huérfanos en Testnet.

## 6. Tareas pendientes

### Bloqueantes / siguientes

- [ ] **Desplegar en Testnet y hacer una donación real end-to-end.** Requiere
      Stellar CLI instalado y una identidad financiada (no disponible en este
      equipo: `stellar` no está en PATH). Pasos: `stellar keys generate/fund`,
      desplegar SAC (`stellar contract asset deploy --asset native`), exportar
      `TOKEN_ID` y ejecutar el script. Ver §9.
- [ ] **Revisar y commitear** el trabajo actual (9 archivos modificados + 1
      nuevo `vite.config.js`). Incluir `Cargo.lock` para builds reproducibles.
- [ ] Confirmar en Testnet que el token configurado tiene saldo/decimals
      adecuados para el donante y que la donación aparece en el historial.

### Mejoras de producto

- [ ] UI para crear carteles, activarlos/desactivarlos y editar montos
      (`create_sign_advanced`, `set_sign_active`, `update_sign_amounts` ya
      existen en contrato, pero **no hay pantalla** para ellos).
- [ ] Mostrar enlace al explorador (stellar.expert) para el hash de transacción.
- [ ] Formatear montos según `decimals` del token (hoy son unidades base).
- [ ] Mostrar el historial por cartel con las donaciones más recientes primero
      (hoy `get_sign_donations` pagina desde `offset` ascendente).
- [ ] Paginación/“cargar más” en historial (hoy topes fijos de 50).
- [ ] Estados de carga/skeleton y bloqueo del botón mientras se firma.
- [ ] Manejo explícito de `isConnected`/extensión ausente en cada acción.

### Calidad / tests

- [ ] Test que verifique realmente el clamp de `limit > MAX_HISTORY`
      (el test `history_is_bounded` solo comprueba el caso vacío).
- [ ] Test de `get_donor_donations` con múltiples donantes y offsets.
- [ ] Test de overflow del total (`checked_add`) si se busca cobertura extra.
- [ ] Tests de frontend (no hay ninguno).
- [ ] Revisar uso de `Error::InvalidLimit` (declarado y no usado) y
      `initialize` devolviendo `NotInitialized` cuando ya está inicializado.

## 7. Errores / problemas conocidos

1. **Despliegue Testnet no verificado.** No se ejecutaron los scripts; no existe
   `deployments/testnet.json`. La carpeta `deployments/` no existe.
2. **Stellar CLI ausente** en este equipo (`stellar` no está en PATH), por lo
   que el despliegue no puede probarse aquí.
3. **`bash` no disponible** (WSL sin distro). `scripts/deploy-testnet.sh` está
   revisado a mano pero no ejecutado con `bash -n`.
4. **Carpeta `contracts/donate_gateway/test_snapshots/`** generada por
   `cargo test` (13 JSON) sin trackear; debería añadirse a `.gitignore`.
5. **`package-lock.json` vacío en la raíz** (artefacto de un `npm` ejecutado en
   el directorio equivocado). Debe eliminarse; el lockfile real es
   `frontend/package-lock.json`.
6. **Rutas absolutas → relativas** ya corregidas, pero si se sirve `dist/` desde
   un servidor que no resuelve relativos sin barra final, revisar.
7. **Advertencia de bundle grande** (~960 KB JS) por Stellar SDK; no rompe nada.
8. **Freighter necesario para leer**: si no hay wallet conectada, la app muestra
   un mensaje y no consulta el contrato (decisión consciente, ver §5).
9. **Idioma**: UI y docs en español; nombres de funciones del contrato en inglés.

## 8. Qué estábamos haciendo exactamente

La última tarea activa fue **corregir la carga del CSS en el navegador**
(fuente serif y controles pegados) y **verificar los scripts de despliegue**:

- Se diagnosticó que el CSS solo se cargaba vía `import './style.css'` y que el
  build usaba rutas absolutas `/assets/...`.
- Se movió el CSS a un `<link>` real, se añadió `vite.config.js` con `base: './'`,
  se endureció `main.js` (init con chequeo de IDs, aviso `file://`,
  `localStorage`, polling de confirmación) y se reescribieron los scripts de
  despliegue con validaciones previas.
- **Verificado:** `cargo test` (13/13), build WASM, `npm run build`, estilos
  computados en navegador (dev y preview).
- **No verificado:** despliegue en Testnet (falta Stellar CLI).

## 9. Siguiente paso exacto

1. Instalar/verificar Stellar CLI y una identidad de Testnet:

   ```bash
   stellar --version
   stellar keys generate deployer --network testnet
   stellar keys fund deployer --network testnet
   stellar contract asset deploy --asset native --source deployer --network testnet
   ```

2. Exportar el contrato de token devuelto y desplegar:

   ```powershell
   # Windows
   $env:TOKEN_ID = "C..."
   .\scripts\deploy-testnet.ps1
   ```

   ```bash
   # Linux/macOS/Git Bash
   TOKEN_ID=C... ./scripts/deploy-testnet.sh
   ```

3. Con el `GATEWAY_CONTRACT` de la salida (o `deployments/testnet.json`):

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Abrir `http://127.0.0.1:5173`, pegar el gateway, conectar Freighter en
   **Testnet**, pulsar un monto y firmar. Confirmar que el hash aparece como
   confirmado y que el total/historial se actualizan.

4. Si el flujo funciona, commitear (sin push) los cambios pendientes y
   actualizar este `TASKS.md` marcando lo verificado.
