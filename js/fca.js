import { addTx, addTxBatch, updateTx, getGrouped } from './db.js';
import { todayStr, formatBRL, showToast, monthLabel, addMonths, lastNMonths } from './utils.js';

const MEM_KEY = 'gastinhos_fca_mem';
const ALL_CATS = ['Moradia','Mercado','Alimentação','Transporte','Saúde','Lazer','Educação','Vestuário','Assinaturas','Investimento','Financeiro','Pet','Presente/Doação','Outros'];

let currentPay = 'Crédito';
let isProvisao = false;
let amountCents = 0;
let updatingAmount = false;
let editId = null;
let installCount = 1;

export function initFCA() {
  document.getElementById('fca-btn').addEventListener('click', openFCA);
  document.getElementById('fca-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('fca-overlay')) closeFCA();
  });

  // Cent-accumulation amount input
  document.getElementById('fca-amount').addEventListener('input', e => {
    if (updatingAmount) return;
    updatingAmount = true;
    const digits = e.target.value.replace(/\D/g, '');
    amountCents = parseInt(digits || '0', 10);
    e.target.value = amountCents > 0 ? formatBRL(amountCents / 100) : '';
    updatingAmount = false;
    updateSubmitState();
    updateInstallmentCalc();
  });

  // Person / Category selects
  document.getElementById('fca-person-select').addEventListener('change', updateSubmitState);
  document.getElementById('fca-cat-select').addEventListener('change', updateSubmitState);

  // Payment chips
  document.getElementById('fca-pay-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-val]'); if (!btn) return;
    document.querySelectorAll('#fca-pay-chips .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    currentPay = btn.dataset.val;
    updateInstCtrl();
    updateInstallmentCalc();
  });

  // Provisão switch
  document.getElementById('fca-provisao-check').addEventListener('change', e => {
    isProvisao = e.target.checked;
  });

  // Date → auto-enforce provisão
  document.getElementById('fca-date').addEventListener('change', () => {
    enforceDateProvisao();
    updateInstallmentCalc();
  });

  // Installment +/- buttons
  document.getElementById('fca-inst-minus').addEventListener('click', () => {
    if (installCount > 1) { installCount--; syncInstDisplay(); }
  });
  document.getElementById('fca-inst-plus').addEventListener('click', () => {
    if (installCount < 60) { installCount++; syncInstDisplay(); }
  });

  document.getElementById('fca-submit').addEventListener('click', handleSubmit);

  window.addEventListener('gastinhos:edit-tx', e => openEditFCA(e.detail));

  // Load category frequency order once (async, non-blocking)
  refreshCatOrder();
}

async function refreshCatOrder() {
  try {
    const { start, end } = lastNMonths(3);
    const map = await getGrouped(start, end, 'category');
    const ranked = Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([k]) => k)
      .filter(k => ALL_CATS.includes(k));
    const rest = ALL_CATS.filter(c => !ranked.includes(c));
    const ordered = [...ranked, ...rest];
    const sel = document.getElementById('fca-cat-select');
    const prev = sel.value;
    sel.innerHTML = '<option value="">—</option>' + ordered.map(c => `<option>${c}</option>`).join('');
    if (prev) sel.value = prev;
  } catch {}
}

function enforceDateProvisao() {
  const dateVal = document.getElementById('fca-date').value;
  const today = todayStr();
  const checkbox = document.getElementById('fca-provisao-check');
  if (!dateVal) return;
  if (dateVal < today) {
    isProvisao = false; checkbox.checked = false; checkbox.disabled = true;
  } else if (dateVal > today) {
    isProvisao = true; checkbox.checked = true; checkbox.disabled = true;
  } else {
    checkbox.disabled = false;
  }
}

function updateInstCtrl() {
  document.getElementById('fca-inst-ctrl').classList.toggle('disabled', currentPay !== 'Crédito');
}

function syncInstDisplay() {
  document.getElementById('fca-inst-display').textContent = installCount;
  updateInstallmentCalc();
}

function openFCA() {
  const mem = (() => { try { return JSON.parse(localStorage.getItem(MEM_KEY)) || {}; } catch { return {}; } })();
  amountCents = 0; isProvisao = false; editId = null; installCount = 1;

  document.getElementById('fca-amount').value = '';
  document.getElementById('fca-description').value = '';
  document.getElementById('fca-date').value = todayStr();
  document.getElementById('fca-inst-display').textContent = '1';
  document.getElementById('fca-inst-summary').textContent = '';

  const checkbox = document.getElementById('fca-provisao-check');
  checkbox.checked = false; checkbox.disabled = false;

  // Person: memory → default person → blank
  const defaultPerson = localStorage.getItem('gastinhos_default_person') || '';
  document.getElementById('fca-person-select').value = mem.person || defaultPerson;

  // Category: memory
  document.getElementById('fca-cat-select').value = mem.cat || '';

  // Payment: memory or default Crédito
  currentPay = mem.pay || 'Crédito';
  document.querySelectorAll('#fca-pay-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.val === currentPay));
  updateInstCtrl();

  document.getElementById('fca-submit').textContent = 'Lançar';
  updateSubmitState();
  document.getElementById('fca-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('fca-amount').focus(), 250);
}

function openEditFCA(tx) {
  openFCA();
  editId = tx.id;

  amountCents = Math.round(tx.amount * 100);
  document.getElementById('fca-amount').value = formatBRL(amountCents / 100);
  document.getElementById('fca-date').value = tx.date;
  document.getElementById('fca-person-select').value = tx.person || '';
  document.getElementById('fca-cat-select').value = tx.category || '';
  document.getElementById('fca-description').value = tx.description || '';

  currentPay = tx.payment_method || 'Crédito';
  document.querySelectorAll('#fca-pay-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.val === currentPay));
  updateInstCtrl();

  installCount = tx.installment_total || 1;
  document.getElementById('fca-inst-display').textContent = installCount;

  isProvisao = tx.status === 'provisao';
  const checkbox = document.getElementById('fca-provisao-check');
  checkbox.checked = isProvisao;
  enforceDateProvisao();

  updateInstallmentCalc();
  document.getElementById('fca-submit').textContent = 'Salvar alterações';
  updateSubmitState();
}

function closeFCA() {
  document.getElementById('fca-overlay').classList.add('hidden');
}

function updateSubmitState() {
  const ok = (amountCents / 100) > 0
    && document.getElementById('fca-person-select').value
    && document.getElementById('fca-cat-select').value;
  document.getElementById('fca-submit').disabled = !ok;
}

function updateInstallmentCalc() {
  const n = currentPay === 'Crédito' ? installCount : 1;
  const amount = amountCents / 100;
  const summary = document.getElementById('fca-inst-summary');
  if (n > 1 && amount > 0) {
    const dateStr = document.getElementById('fca-date').value;
    if (dateStr) {
      const [y, m] = dateStr.split('-').map(Number);
      const last = addMonths(y, m, n - 1);
      summary.textContent = `${n}x de ${formatBRL(amount / n)} · até ${monthLabel(last.year, last.month)}`;
    }
  } else {
    summary.textContent = '';
  }
}

async function handleSubmit() {
  const amount = amountCents / 100;
  if (!amount || amount <= 0) return;
  const dateStr = document.getElementById('fca-date').value;
  const desc = document.getElementById('fca-description').value.trim() || null;
  const n = currentPay === 'Crédito' ? installCount : 1;
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = todayStr();
  const currentPerson = document.getElementById('fca-person-select').value;
  const currentCat = document.getElementById('fca-cat-select').value;

  const btn = document.getElementById('fca-submit');
  btn.disabled = true; btn.textContent = 'Salvando…';

  try {
    if (editId) {
      await updateTx(editId, {
        date: dateStr, amount, category: currentCat, person: currentPerson,
        description: desc, payment_method: currentPay || null,
        status: isProvisao ? 'provisao' : 'realizado'
      });
      showToast('Alterações salvas');
    } else if (n <= 1) {
      const status = isProvisao ? 'provisao' : 'realizado';
      await addTx({ date: dateStr, type: 'expense', amount, category: currentCat,
        person: currentPerson, description: desc, payment_method: currentPay || null, status });
      showToast(status === 'provisao' ? 'Provisão registrada' : 'Lançamento salvo');
    } else {
      const groupId = crypto.randomUUID();
      const perAmount = Math.round(amount / n * 100) / 100;
      const rows = Array.from({ length: n }, (_, i) => {
        const dt = addMonths(y, m, i);
        const dateI = `${dt.year}-${String(dt.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const status = isProvisao ? 'provisao' : (dateI <= today ? 'realizado' : 'provisao');
        return { date: dateI, type: 'expense', amount: perAmount, category: currentCat,
          person: currentPerson, description: desc, payment_method: 'Crédito',
          installment_current: i + 1, installment_total: n, installment_group_id: groupId, status };
      });
      await addTxBatch(rows);
      showToast(`${n} parcelas criadas`);
    }
    localStorage.setItem(MEM_KEY, JSON.stringify({ person: currentPerson, pay: currentPay, cat: currentCat }));
    closeFCA();
    window.dispatchEvent(new CustomEvent('gastinhos:tx-saved'));
  } catch (e) {
    showToast('Erro ao salvar: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = editId ? 'Salvar alterações' : 'Lançar';
  }
}
