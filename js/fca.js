import { addTx, addTxBatch } from './db.js';
import { todayStr, formatBRL, showToast, monthLabel, addMonths } from './utils.js';

const EXPENSE_CATS = ['Moradia','Mercado','Alimentação','Transporte','Saúde','Lazer','Educação','Vestuário','Assinaturas','Investimento','Financeiro','Pet','Presente/Doação','Outros'];
const MEM_KEY = 'gastinhos_fca_mem';

let currentType = 'expense';
let currentPerson = '';
let currentCat = '';
let currentPay = '';
let rawAmount = '';

export function initFCA() {
  const overlay = document.getElementById('fca-overlay');
  const btn = document.getElementById('fca-btn');
  btn.addEventListener('click', () => { openFCA(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeFCA(); });

  // type toggle
  document.getElementById('fca-income-btn').addEventListener('click', () => setType('income'));
  document.getElementById('fca-expense-btn').addEventListener('click', () => setType('expense'));

  // amount
  const amountInput = document.getElementById('fca-amount');
  amountInput.addEventListener('input', () => {
    let v = amountInput.value.replace(/[^\d,\.]/g,'').replace(',','.');
    rawAmount = v;
    updateSubmitState();
    updateInstallmentSummary();
  });

  // person chips
  document.getElementById('fca-person-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-val]'); if (!btn) return;
    document.querySelectorAll('#fca-person-chips .chip').forEach(c=>c.classList.remove('active'));
    btn.classList.add('active'); currentPerson = btn.dataset.val;
    updateSubmitState();
  });

  // payment chips
  document.getElementById('fca-pay-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-val]'); if (!btn) return;
    document.querySelectorAll('#fca-pay-chips .chip').forEach(c=>c.classList.remove('active'));
    btn.classList.add('active'); currentPay = btn.dataset.val;
    const instSection = document.getElementById('fca-installment-section');
    if (currentPay === 'Crédito') instSection.classList.remove('hidden');
    else { instSection.classList.add('hidden'); document.getElementById('fca-inst-count').value = 1; }
    updateInstallmentSummary();
  });

  // installment count
  document.getElementById('fca-inst-count').addEventListener('input', updateInstallmentSummary);

  // category grid (built when type changes)
  document.getElementById('fca-cat-grid').addEventListener('click', e => {
    const btn = e.target.closest('.fca-cat-btn'); if (!btn) return;
    document.querySelectorAll('.fca-cat-btn').forEach(c=>c.classList.remove('active'));
    btn.classList.add('active'); currentCat = btn.dataset.cat;
    updateSubmitState();
  });

  // submit
  document.getElementById('fca-submit').addEventListener('click', handleSubmit);

  // date default
  document.getElementById('fca-date').value = todayStr();
}

function openFCA() {
  // restore memory
  const mem = (() => { try { return JSON.parse(localStorage.getItem(MEM_KEY))||{}; } catch { return {}; } })();
  if (mem.person) { currentPerson=mem.person; document.querySelectorAll('#fca-person-chips .chip').forEach(c=>{ c.classList.toggle('active', c.dataset.val===mem.person); }); }
  if (mem.pay) { currentPay=mem.pay; document.querySelectorAll('#fca-pay-chips .chip').forEach(c=>{ c.classList.toggle('active', c.dataset.val===mem.pay); }); if (mem.pay==='Crédito') document.getElementById('fca-installment-section').classList.remove('hidden'); }
  setType(currentType);
  document.getElementById('fca-date').value = todayStr();
  document.getElementById('fca-amount').value = '';
  rawAmount = '';
  currentCat = '';
  document.getElementById('fca-inst-count').value = 1;
  updateSubmitState();
  document.getElementById('fca-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('fca-amount').focus(), 200);
}

function closeFCA() {
  document.getElementById('fca-overlay').classList.add('hidden');
}

function setType(type) {
  currentType = type;
  const iBtn = document.getElementById('fca-income-btn');
  const eBtn = document.getElementById('fca-expense-btn');
  iBtn.className = 'fca-type-btn' + (type==='income' ? ' active-income' : '');
  eBtn.className = 'fca-type-btn' + (type==='expense' ? ' active-expense' : '');
  const catSection = document.getElementById('fca-cat-section');
  if (type === 'expense') {
    catSection.style.display = '';
    const grid = document.getElementById('fca-cat-grid');
    grid.innerHTML = EXPENSE_CATS.map(c=>`<button class="fca-cat-btn${c===currentCat?' active':''}" data-cat="${c}">${c}</button>`).join('');
  } else {
    catSection.style.display = 'none';
    currentCat = '';
  }
  updateSubmitState();
}

function updateSubmitState() {
  const amount = parseFloat(rawAmount) || 0;
  const ok = amount > 0 && currentPerson && (currentType==='income' || currentCat);
  document.getElementById('fca-submit').disabled = !ok;
}

function updateInstallmentSummary() {
  const n = parseInt(document.getElementById('fca-inst-count').value) || 1;
  const amount = parseFloat(rawAmount) || 0;
  const per = amount / n;
  document.getElementById('fca-inst-per').textContent = formatBRL(per);
  const summaryEl = document.getElementById('fca-inst-summary');
  if (n > 1) {
    const dateStr = document.getElementById('fca-date').value;
    const [y,m,d] = dateStr.split('-').map(Number);
    const last = addMonths(y, m, n-1);
    summaryEl.textContent = `${n}x de ${formatBRL(per)} — até ${monthLabel(last.year, last.month)}`;
  } else { summaryEl.textContent = ''; }
}

async function handleSubmit() {
  const amount = parseFloat(rawAmount);
  if (!amount || amount <= 0) return;
  const dateStr = document.getElementById('fca-date').value;
  const n = parseInt(document.getElementById('fca-inst-count').value) || 1;
  const desc = document.getElementById('fca-description').value.trim();
  const [y,m,d] = dateStr.split('-').map(Number);
  const btn = document.getElementById('fca-submit');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    if (n <= 1) {
      await addTx({
        date: dateStr, type: currentType, amount, category: currentType==='expense'?currentCat:null,
        person: currentPerson, description: desc || null, payment_method: currentPay || null
      });
      showToast('Lançamento salvo');
    } else {
      const groupId = crypto.randomUUID();
      const perAmount = Math.round(amount / n * 100) / 100;
      const rows = Array.from({length:n},(_,i)=>{
        const dt = addMonths(y, m, i);
        const dateI = `${dt.year}-${String(dt.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        return {
          date: dateI, type: 'expense', amount: perAmount,
          category: currentCat, person: currentPerson, description: desc||null,
          payment_method: 'Crédito', installment_current: i+1, installment_total: n,
          installment_group_id: groupId
        };
      });
      await addTxBatch(rows);
      showToast(`${n} parcelas criadas`);
    }
    localStorage.setItem(MEM_KEY, JSON.stringify({ person: currentPerson, pay: currentPay }));
    closeFCA();
    document.getElementById('fca-description').value = '';
  } catch(e) {
    showToast('Erro ao salvar: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Lançar';
  }
}
