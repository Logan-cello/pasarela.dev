import * as StellarSdk from '@stellar/stellar-sdk';
import {
  isConnected,
  requestAccess,
  getPublicKey,
  signTransaction,
  getNetworkDetails,
} from '@stellar/freighter-api';

/*
 * El CSS se carga con <link rel="stylesheet" href="./src/style.css"> en index.html.
 * Antes solo se importaba desde este módulo: si el módulo fallaba (file://, ruta
 * incorrecta o error de import), la página quedaba sin estilos. El <link> es
 * independiente del JS y Vite lo procesa igual en build.
 */

const STORAGE_KEY = 'donate-plaza:gateway';
const $ = (id) => document.getElementById(id);

let publicKey = '';
let selectedSign = null;

const rpc = () => new StellarSdk.rpc.Server($('rpc').value.trim());
const contract = () => new StellarSdk.Contract($('gateway').value.trim());

function setStatus(text, error = false) {
  const status = $('status');
  if (!status) return;
  status.textContent = text;
  status.className = `status ${error ? 'error' : ''}`;
}

function address(value) {
  return value ? `${String(value).slice(0, 5)}…${String(value).slice(-4)}` : '';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);
}

function formatError(error) {
  const message = error?.message || String(error);
  if (/unreachable|fetch|network|failed to fetch/i.test(message)) return `Error de red/RPC: ${message}`;
  if (/reject|cancel|denied/i.test(message)) return `Firma rechazada por Freighter: ${message}`;
  if (/simulation/i.test(message)) return message;
  return message;
}

async function connectionSource() {
  if (!publicKey) {
    throw new Error('Conecta Freighter en Testnet para consultar Soroban (la simulación necesita una cuenta existente).');
  }
  try {
    const account = await rpc().getAccount(publicKey);
    return new StellarSdk.Account(publicKey, account.sequenceNumber());
  } catch (error) {
    throw new Error(
      `No se pudo cargar la cuenta ${address(publicKey)} en Testnet: ${error.message || error}`,
    );
  }
}

async function invokeView(method, args = []) {
  const account = await connectionSource();
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(contract().call(method, ...args))
    .setTimeout(60)
    .build();

  const simulation = await rpc().simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
    throw new Error(`Error de simulación: ${simulation.error}`);
  }
  if (!simulation.result?.retval) return null;
  return StellarSdk.scValToNative(simulation.result.retval);
}

async function connect() {
  try {
    if (!(await isConnected())) throw new Error('Instala y desbloquea Freighter.');
    const access = await requestAccess();
    const fromAccess = typeof access === 'string' ? access : access?.address;
    const fromApi = await getPublicKey();
    publicKey = fromAccess || fromApi;

    const network = await getNetworkDetails();
    if (network.networkPassphrase && network.networkPassphrase !== StellarSdk.Networks.TESTNET) {
      throw new Error(
        `Red incorrecta: cambia Freighter a Stellar Testnet. Detectada: ${network.networkPassphrase}`,
      );
    }

    $('connect').textContent = address(publicKey);
    setStatus(`Wallet conectada: ${address(publicKey)}`);
    if ($('gateway').value.trim()) await loadSigns();
  } catch (error) {
    setStatus(error.message || 'No fue posible conectar Freighter.', true);
  }
}

async function loadSigns() {
  if (!$('gateway').value.trim()) return;
  try {
    const count = Number(await invokeView('sign_count'));
    const cards = [];

    for (let i = 0; i < count; i++) {
      const sign = await invokeView('get_sign', [StellarSdk.xdr.ScVal.scvU32(i)]);
      const total = Number(await invokeView('get_sign_total', [StellarSdk.xdr.ScVal.scvU32(i)]));
      cards.push({ id: i, sign, total });
    }

    $('signs').innerHTML = cards.map(({ id, sign, total }) => `
      <article class="sign ${sign.active ? '' : 'inactive'}">
        <span class="tag">CARTEL #${id}</span>
        <h2>${escapeHtml(sign.title)}</h2>
        <p>Recibe: ${address(sign.receiver)}</p>
        <p class="total">Recaudado: <strong>${total}</strong> unidades base</p>
        ${sign.active ? '' : '<p class="inactive-label">Cartel desactivado</p>'}
        <div class="amounts">
          ${sign.active
            ? sign.amounts.map((amount) => `<button type="button" data-id="${id}" data-amount="${amount}">${amount} donar</button>`).join('')
            : ''}
          ${sign.active && sign.custom_enabled ? `<button type="button" class="custom-button" data-id="${id}" data-custom="true">Monto personalizado</button>` : ''}
        </div>
      </article>`).join('') || '<p>No hay carteles aún. Crea uno con create_sign.</p>';

    document.querySelectorAll('.amounts button').forEach((button) => {
      button.onclick = () => openDonate(
        Number(button.dataset.id),
        button.dataset.custom === 'true' ? null : Number(button.dataset.amount),
      );
    });

    await loadHistory();
    setStatus(`${count} cartel(es) cargado(s); totales consultados desde Soroban.`);
  } catch (error) {
    setStatus(formatError(error), true);
  }
}

async function loadHistory() {
  if (!$('gateway').value.trim()) return;
  const mode = $('history-filter').value;
  let rows = [];

  try {
    if (mode === 'sign') {
      const signId = Number($('filter-value').value);
      if (!Number.isInteger(signId) || signId < 0) throw new Error('Introduce un ID de cartel válido.');
      rows = await invokeView('get_sign_donations', [
        StellarSdk.xdr.ScVal.scvU32(signId),
        StellarSdk.xdr.ScVal.scvU32(0),
        StellarSdk.xdr.ScVal.scvU32(50),
      ]);
    } else if (mode === 'donor') {
      const donor = $('filter-value').value.trim();
      if (!donor) throw new Error('Introduce la dirección G… del donante.');
      rows = await invokeView('get_donor_donations', [
        StellarSdk.Address.fromString(donor).toScVal(),
        StellarSdk.xdr.ScVal.scvU32(0),
        StellarSdk.xdr.ScVal.scvU32(50),
      ]);
    } else {
      const count = Number(await invokeView('donation_count'));
      for (let i = Math.max(0, count - 50); i < count; i++) {
        const donation = await invokeView('get_donation', [StellarSdk.xdr.ScVal.scvU32(i)]);
        if (donation) rows.push(donation);
      }
      rows.reverse();
    }

    $('history').innerHTML = (rows || []).map((donation) => `
      <div class="row">
        <b>${donation.amount}</b>
        <span>${address(donation.donor)} → cartel #${donation.sign_id}</span>
        <small>${escapeHtml(donation.message || 'sin mensaje')} · ledger ${donation.ledger}</small>
      </div>`).join('') || '<p>No hay donaciones para este filtro.</p>';
  } catch (error) {
    setStatus(formatError(error), true);
  }
}

async function openDonate(signId, amount) {
  try {
    selectedSign = signId;
    const sign = await invokeView('get_sign', [StellarSdk.xdr.ScVal.scvU32(signId)]);
    $('dialog-title').textContent = `Donar al cartel #${signId}`;
    $('amount').value = amount ?? '';
    $('amount').min = sign.custom_enabled ? String(sign.custom_min) : '1';
    $('amount').max = sign.custom_enabled ? String(sign.custom_max) : '';
    $('custom-range').textContent = sign.custom_enabled
      ? `Monto personalizado permitido: ${sign.custom_min}–${sign.custom_max}`
      : 'Solo montos predefinidos';
    $('donate').showModal();
  } catch (error) {
    setStatus(formatError(error), true);
  }
}

async function waitForTransaction(hash) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await rpc().getTransaction(hash);
    if (result.status === 'SUCCESS') return result;
    if (result.status === 'FAILED') throw new Error(`Transacción fallida: ${hash}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

async function submitDonation(event) {
  event.preventDefault();
  try {
    if (!publicKey) await connect();
    if (!publicKey) throw new Error('Conecta Freighter para firmar la donación.');
    if (selectedSign === null) throw new Error('Selecciona un cartel primero.');
    if (location.protocol === 'file:') {
      throw new Error('Abre la demo con "npm run dev" (no con file://) para firmar transacciones.');
    }

    const amount = Number($('amount').value);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Introduce un monto válido.');

    const args = [
      StellarSdk.Address.fromString(publicKey).toScVal(),
      StellarSdk.xdr.ScVal.scvU32(selectedSign),
      StellarSdk.nativeToScVal(BigInt(amount), { type: 'i128' }),
      StellarSdk.nativeToScVal($('message').value, { type: 'string' }),
    ];

    const account = await rpc().getAccount(publicKey);
    let tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(contract().call('donate', ...args))
      .setTimeout(180)
      .build();

    const simulation = await rpc().simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
      throw new Error(`Error de simulación: ${simulation.error}`);
    }

    tx = StellarSdk.rpc.assembleTransaction(tx, simulation).build();
    let signed;
    try {
      signed = await signTransaction(tx.toXDR(), {
        networkPassphrase: StellarSdk.Networks.TESTNET,
        address: publicKey,
      });
    } catch (error) {
      throw new Error(`Firma rechazada por Freighter: ${error.message || error}`);
    }

    const signedXdr = typeof signed === 'string' ? signed : (signed.signedTxXdr || signed);
    const sent = await rpc().sendTransaction(
      StellarSdk.TransactionBuilder.fromXDR(signedXdr, StellarSdk.Networks.TESTNET),
    );

    $('donate').close();
    setStatus(`Transacción enviada: ${sent.hash}. Esperando confirmación…`);

    const confirmed = await waitForTransaction(sent.hash);
    setStatus(
      confirmed
        ? `Donación confirmada on-chain: ${sent.hash}`
        : `Transacción enviada (pendiente de confirmación): ${sent.hash}`,
    );
    await loadSigns();
  } catch (error) {
    setStatus(formatError(error), true);
  }
}

function init() {
  const requiredIds = [
    'connect', 'gateway', 'rpc', 'status', 'signs', 'history', 'history-filter',
    'filter-value', 'filter-value-wrap', 'donate', 'dialog-title', 'amount',
    'custom-range', 'message', 'submit-donation', 'cancel-donation',
  ];
  const missing = requiredIds.filter((id) => !$(id));
  if (missing.length) {
    console.error('[Donate Plaza] Faltan elementos en index.html:', missing);
    setStatus(`Error de HTML: faltan elementos (${missing.join(', ')}).`, true);
    return;
  }

  const savedGateway = localStorage.getItem(STORAGE_KEY);
  if (savedGateway && !$('gateway').value) $('gateway').value = savedGateway;

  $('connect').onclick = connect;
  $('gateway').onchange = () => {
    localStorage.setItem(STORAGE_KEY, $('gateway').value.trim());
    loadSigns();
  };
  $('rpc').onchange = loadSigns;
  $('cancel-donation').onclick = () => $('donate').close();
  $('submit-donation').onclick = submitDonation;

  $('history-filter').onchange = () => {
    const filtered = $('history-filter').value !== 'all';
    $('filter-value-wrap').classList.toggle('hidden', !filtered);
    $('filter-value').placeholder = $('history-filter').value === 'sign'
      ? 'Ej: 0'
      : 'Dirección G...';
    loadHistory();
  };
  $('filter-value').onchange = loadHistory;

  if (location.protocol === 'file:') {
    setStatus('Estilos visibles, pero para conectar Freighter y consultar Soroban abre la app con "npm run dev".', true);
    return;
  }

  if ($('gateway').value.trim()) {
    setStatus(`${savedGateway ? 'Gateway guardado' : 'Gateway configurado'}: conecta Freighter para cargar los carteles.`);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
