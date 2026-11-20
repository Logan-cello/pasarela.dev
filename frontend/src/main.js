import * as StellarSdk from '@stellar/stellar-sdk';
import { isConnected, requestAccess, getAddress, signTransaction } from '@stellar/freighter-api';
import './style.css';

const $ = (id) => document.getElementById(id);
let publicKey = ''; let selected = null;
const rpc = () => new StellarSdk.rpc.Server($('rpc').value.trim());
const contract = () => new StellarSdk.Contract($('gateway').value.trim());
const native = (v) => StellarSdk.scValToNative(v);
function setStatus(text, error=false) { $('status').textContent = text; $('status').className = `status ${error ? 'error' : ''}`; }
async function call(method, args=[]) {
  const account = await rpc().getAccount(publicKey || StellarSdk.Keypair.random().publicKey());
  const tx = new StellarSdk.TransactionBuilder(account, { fee: StellarSdk.BASE_FEE, networkPassphrase: StellarSdk.Networks.TESTNET })
    .addOperation(contract().call(method, ...args)).setTimeout(60).build();
  const sim = await rpc().simulateTransaction(tx); if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return native(sim.result.retval);
}
function address(a) { return a ? `${a.slice(0,5)}…${a.slice(-4)}` : ''; }
async function load() {
  if (!$('gateway').value.trim()) return;
  try { const count = Number(await call('sign_count')); const cards=[]; for (let i=0;i<count;i++) cards.push(await call('get_sign',[StellarSdk.xdr.ScVal.scvU32(i)]));
    $('signs').innerHTML = cards.map((s,i) => `<article class="sign ${s.active?'':'inactive'}"><span class="tag">CARTEL #${i}</span><h2>${s.title}</h2><p>Recibe: ${address(s.receiver)}</p><div class="amounts">${s.amounts.map(a=>`<button data-id="${i}" data-amount="${a}">${a} donar</button>`).join('')}</div></article>`).join('') || '<p>No hay carteles aún. Usa el script de despliegue para crear uno.</p>';
    document.querySelectorAll('.amounts button').forEach(b=>b.onclick=()=>openDonate(Number(b.dataset.id), b.dataset.amount));
    await loadHistory(); setStatus(`${count} cartel(es) cargado(s) desde Soroban.`);
  } catch(e) { setStatus(e.message, true); }
}
async function loadHistory() { const n=Number(await call('donation_count')); const rows=[]; for(let i=Math.max(0,n-8);i<n;i++){ const d=await call('get_donation',[StellarSdk.xdr.ScVal.scvU32(i)]); rows.push(`<div class="row"><b>${d.amount}</b><span>${address(d.donor)} → cartel #${d.sign_id}</span><small>${d.message || 'sin mensaje'} · ledger ${d.ledger}</small></div>`); } $('history').innerHTML=rows.join('') || '<p>Aún no hay donaciones.</p>'; }
async function openDonate(id, amount) { selected=id; $('amount').value=amount; $('dialog-title').textContent=`Donar al cartel #${id}`; $('donate').showModal(); }
async function connect() { try { const ok=await isConnected(); if(!ok) throw new Error('Instala y desbloquea Freighter.'); const res=await requestAccess(); const addr=await getAddress(); publicKey=res.address || addr.address || addr; $('connect').textContent=address(publicKey); setStatus(`Wallet conectada: ${address(publicKey)}`); } catch(e){setStatus(e.message,true);} }
$('connect').onclick=connect; $('gateway').onchange=load; $('submit-donation').onclick=async(e)=>{e.preventDefault(); try { if(!publicKey) await connect(); const args=[StellarSdk.Address.fromString(publicKey).toScVal(), StellarSdk.xdr.ScVal.scvU32(selected), StellarSdk.nativeToScVal(BigInt($('amount').value),{type:'i128'}), StellarSdk.nativeToScVal($('message').value,{type:'string'})]; const account=await rpc().getAccount(publicKey); let tx=new StellarSdk.TransactionBuilder(account,{fee:StellarSdk.BASE_FEE,networkPassphrase:StellarSdk.Networks.TESTNET}).addOperation(contract().call('donate',...args)).setTimeout(180).build(); const sim=await rpc().simulateTransaction(tx); if(StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error); tx=StellarSdk.rpc.assembleTransaction(tx,sim).build(); const signed=await signTransaction(tx.toXDR(),{networkPassphrase:StellarSdk.Networks.TESTNET,address:publicKey}); const signedXdr=signed.signedTxXdr || signed; const sent=await rpc().sendTransaction(StellarSdk.TransactionBuilder.fromXDR(signedXdr,'base64',StellarSdk.Networks.TESTNET)); $('donate').close(); setStatus(`Transacción enviada: ${sent.hash}. Esperando confirmación…`); await new Promise(r=>setTimeout(r,4000)); await load(); } catch(e){setStatus(e.message,true);} };
