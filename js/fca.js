import { addTx, addTxBatch } from './db.js';
import { todayStr, formatBRL, showToast, monthLabel, addMonths } from './utils.js';

const EXPENSE_CATS = [
  'Moradia','Mercado','Alimentação','Transporte','Saúde',
  'Lazer','Educação','Vestuário','Assinaturas','Investimento',
  'Financeiro','Pet','Presente/Doação','Outros'
];
const MEM_KEY = 'gastinhos_fca_mem';

let currentCat = '';
let currentPerson = '';
let currentPay = '';
let isProvisao = false;
let rawAmount = '';

export function initFCA() {
  document.getElementById('fca-btn').addEventListener('click', openFCA);
  document.getElementById('fca-overlay').addEventListener('click', e => { if (e.target === document.getElementById('fca-overlay')) closeFCA(); });

  document.getElementById('fca-amount').addEventListener('input', e => {
    rawAmount = e.target.value.replace(/[^\d,\.]/g,'').replace(',','.');
    updateSubmitState(); updateInstallmentCalc();
  });

  document.getElementById('fca-person-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-val]'); if (!btn) return;
    document.querySelectorAll('#fca-person-chips .chip').forEach(c=>c.classList.remove('active'));
    btn.classList.add('active'); currentPerson = btn.dataset.val; updateSubmitState();
  });

  document.getElementById('fca-pay-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-val]'); if (!btn) return;
    document.querySelectorAll('#fca-pay-chips .chip').forEach(c=>c.classList.remove('active'));
    btn.classList.add('active'); currentPay = btn.dataset.val;
    const inst = document.getElementById('fca-installment-section');
    if (currentPay === 'Crédito') inst.classList.remove('hidden');
    else { inst.classList.add('hidden'); document.getElementById('fca-inst-count').value=1; }
    updateInstallmentCalc();
  });

  document.getElementById('fca-provisao-btn').addEventListener('click', () => {
    isProvisao = !isProvisao;
    document.getElementById('fca-provisao-btn').classList.toggle('active', isProvisao);
  });

  document.getElementById('fca-cat-grid').addEventListener('click', e => {
    const btn = e.target.closest('.fca-cat-btn'); if (!btn) return;
    document.querySelectorAll('.fca-cat-btn').forEach(c=>c.classList.remove('active'));
    btn.classList.add('active'); currentCat = btn.dataset.cat; updateSubmitState();
  });

  document.getElementById('fca-inst-count').addEventListener('input', updateInstallmentCalc);
  document.getElementById('fca-date').addEventListener('change', updateInstallmentCalc);
  document.getElementById('fca-submit').addEventListener('click', handleSubmit);

  // build category grid once
  document.getElementById('fca-cat-grid').innerHTML = EXPENSE_CATS
    .map(c=>`<button class="fca-cat-btn" data-cat="${c}">${c}</button>`).join('');
}

function openFCA() {
  const mem = (() => { try { return JSON.parse(localStorage.getItem(MEM_KEY))||{}; } catch { return {}; } })();
  rawAmount = ''; currentCat = ''; isProvisao = false;

  document.getElementById('fca-amount').value = '';
  document.getElementById('fca-description').value = '';
  document.getElementById('fca-date').value = todayStr();
  document.getElementById('fca-inst-count').value = 1;
  document.getElementById('fca-installment-section').classList.add('hidden');
  document.getElementById('fca-provisao-btn').classList.remove('active');
  document.querySelectorAll('.fca-cat-btn').forEach(c=>c.classList.remove('active'));

  currentPerson = mem.person || '';
  document.querySelectorAll('#fca-person-chips .chip').forEach(c=>c.classList.toggle('active', c.dataset.val===currentPerson));

  currentPay = mem.pay || '';
  document.querySelectorAll('#fca-pay-chips .chip').forEach(c=>c.classList.toggle('active', c.dataset.val===currentPay));
  if (currentPay==='Crédito') document.getElementById('fca-installment-section').classList.remove('hidden');

  updateSubmitState();
  document.getElementById('fca-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('fca-amount').focus(), 250);
}

function closeFCA() {
  document.getElementById('fca-overlay').classList.add('hidden');
}

function updateSubmitState() {
  const ok = (parseFloat(rawAmount)||0) > 0 && currentPerson && currentCat;
  document.getElementById('fca-submit').disabled = !ok;
}

function updateInstallmentCalc() {
  const n = parseInt(document.getElementById('fca-inst-count').value)||1;
  const amount = parseFloat(rawAmount)||0;
  document.getElementById('fca-inst-per').textContent = formatBRL(n>0 ? amount/n : 0);
  const summary = document.getElementById('fca-inst-summary');
  if (n>1 && amount>0) {
    const dateStr = document.getElementById('fca-date').value;
    if (dateStr) {
      const [y,m] = dateStr.split('-').map(Number);
      const last = addMonths(y,m,n-1);
      summary.textContent = `${n}x de ${formatBRL(amount/n)} · até ${monthLabel(last.year,last.month)}`;
    }
  } else { summary.textContent = ''; }
}

async function handleSubmit() {
  const amount = parseFloat(rawAmount);
  if (!amount || amount<=0) return;
  const dateStr = document.getElementById('fca-date').value;
  const desc = document.getElementById('fca-description').value.trim()||null;
  const n = parseInt(document.getElementById('fca-inst-count').value)||1;
  const [y,m,d] = dateStr.split('-').map(Number);
  const today = todayStr();

  const btn = document.getElementById('fca-submit');
  btn.disabled = true; btn.textContent = 'Salvando…';

  try {
    if (n<=1) {
      const status = isProvisao ? 'provisao' : 'realizado';
      await addTx({ date:dateStr, type:'expense', amount, category:currentCat,
        person:currentPerson, description:desc, payment_method:currentPay||null, status });
      showToast(status==='provisao' ? 'Provisão registrada' : 'Lançamento salvo');
    } else {
      const groupId = crypto.randomUUID();
      const perAmount = Math.round(amount/n*100)/100;
      const rows = Array.from({length:n},(_,i)=>{
        const dt = addMonths(y,m,i);
        const dateI = `${dt.year}-${String(dt.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        // past/current = realizado, future = provisao
        const status = isProvisao ? 'provisao' : (dateI <= today ? 'realizado' : 'provisao');
        return { date:dateI, type:'expense', amount:perAmount, category:currentCat,
          person:currentPerson, description:desc, payment_method:'Crédito',
          installment_current:i+1, installment_total:n, installment_group_id:groupId, status };
      });
      await addTxBatch(rows);
      showToast(`${n} parcelas criadas`);
    }
    localStorage.setItem(MEM_KEY, JSON.stringify({person:currentPerson, pay:currentPay}));
    closeFCA();
  } catch(e) {
    showToast('Erro ao salvar: '+e.message, 'error');
  } finally {
    btn.disabled=false; btn.textContent='Lançar';
  }
}
