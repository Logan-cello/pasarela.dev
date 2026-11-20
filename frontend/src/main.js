import * as StellarSdk from '@stellar/stellar-sdk';
import { isConnected, requestAccess, getAddress, signTransaction, getNetworkDetails } from '@stellar/freighter-api';
import './style.css';

const $ = (id) => document.getElementById(id);
let publicKey = '';
let selectedSign = null;

const rpc = () => new StellarSdk.rpc.Server($('rpc').value.trim());
const contract = () => new StellarSdk.Contract($('gateway').value.trim());

function setStatus(text, error = false) {
  $('status').textContent = text;
  $('status').className = `status ${error ? 'error' : ''}`;
}

function address(value) {
  return value ? `${String(value).slice(0, 5)}…${String(value).slice(-4)}` : '';
}

async function invokeView(method, args = []) {
  const viewAddress = publicKey || StellarSdk.Keypair.random().publicKey();
  const account = await rpc().getAccount(viewAddress);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  }).addOperation(contract().call(method, ...args)).setTimeout(60).build();

  const simulation = await rpc().simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
    throw new Error(`Error de simulación: ${simulation.error}`);
  }
  if (!simulation.result?.retval) return null;
  return StellarSdk.scValToNative(simulation.result.retval);
}

async function connect() {
  try {
    if (!await isConnected()) throw new Error('Instala y desbloquea Freighter.');
    const access = await requestAccess();
    const addressResult = await getAddress();
    publicKey = access.address || addressResult.address || addressResult;

    const network = await getNetworkDetails();
    if (network.networkPassphrase && network.networkPassphrase !== StellarSdk.Networks.TESTNET) {
      throw new Error(`Red incorrecta: cambia Freighter a Stellar Testnet. Detectada: ${network.networkPassphrase}`);
    }

    $('connect').textContent = address(publicKey);
    setStatus(`Wallet conectada: ${address(publicKey)}`);
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
          ${sign.active ? sign.amounts.map(amount => `<button data-id="${id}" data-amount="${amount}" ${sign.active ? '' : 'disabled'}>${amount} donar</button>`).join('') : ''}
          ${sign.active && sign.custom_enabled ? `<button class="custom-button" data-id="${id}" data-custom="true">Monto personalizado</button>` : ''}
        </div>
      </article>`).join('') || '<p>No hay carteles aún.</p>';

    document.querySelectorAll('.amounts button').forEach(button => {
      button.onclick = () => openDonate(
        Number(button.dataset.id),
        button.dataset.custom === 'true' ? null : Number(button.dataset.amount)
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

    $('history').innerHTML = (rows || []).map(donation => `
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
}

function formatError(error) {
  const message = error?.message || String(error);
  if (/unreachable|fetch|network/i.test(message)) return `Error de red/RPC: ${message}`;
  if (/reject|cancel/i.test(message)) return `Firma rechazada por Freighter: ${message}`;
  if (/simulation/i.test(message)) return message;
  return message;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

$('connect').onclick = connect;
$('gateway').onchange = loadSigns;
$('rpc').onchange = loadSigns;
$('history-filter').onchange = () => {
  const filtered = $('history-filter').value !== 'all';
  $('filter-value-wrap').classList.toggle('hidden', !filtered);
  $('filter-value').placeholder = $('history-filter').value === 'sign' ? 'Ej: 0' : 'Dirección G...';
  loadHistory();
};
$('filter-value').onchange = loadHistory;

$('submit-donation').onclick = async (event) => {
  event.preventDefault();
  try {
    if (!publicKey) await connect();
    if (!selectedSign && selectedSign !== 0) throw new Error('Selecciona un cartel primero.');

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
    }).addOperation(contract().call('donate', ...args)).setTimeout(180).build();

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

    const signedXdr = signed.signedTxXdr || signed;
    const sent = await rpc().sendTransaction(
      StellarSdk.TransactionBuilder.fromXDR(signedXdr, StellarSdk.Networks.TESTNET)
    );

    $('donate').close();
    setStatus(`Transacción enviada: ${sent.hash}. Esperando confirmación…`);

    await new Promise(resolve => setTimeout(resolve, 4000));
    await loadSigns();
  } catch (error) {
    setStatus(formatError(error), true);
  }
};
