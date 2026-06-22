import { addTx, addTxBatch, updateTx, getGrouped } from './db.js';
import { todayStr, formatBRL, showToast, monthLabel, addMonths, lastNMonths } from './utils.js';

const MEM_KEY = 'gastinhos_fca_mem';
const ALL_CATS = ['Moradia','Mercado','Alimentação','Transporte','Saúde','Lazer','Educação','Vestuário','Assinaturas','Investimento','Financeiro','Pet','Presente/Doação','Outros'];

let currentPay = 'Crédito';
let currentPerson = '';
let amountCents = 0;
let updatingAmount = false;
let editId = null;
let installCount = 1;

export function initFCA() {
  document.getElementById('fca-btn').addEventListener('click', openFCA);
  document.getElementById('fca-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('fca-overlay')) closeFCA();
  });

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

  document.getElementById('fca-person-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-val]'); if (!btn) return;
    document.querySelectorAll('#fca-person-chips .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    currentPerson = btn.dataset.val;
    updateSubmitState();
  });

  document.getElementById('fca-cat-select').addEventListener('change', updateSubmitState);

  document.getElementById('fca-pay-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-val]'); if (!btn) return;
    document.querySelectorAll('#fca-pay-chips .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    currentPay = btn.dataset.val;
    updateInstCtrl();
    updateInstallmentCalc();
  });

  document.getElementById('fca-date').addEventListener('change', updateInstallmentCalc);

  document.getElementById('fca-inst-minus').addEventListener('click', () => {
    if (installCount > 1) { installCount--; syncInstDisplay(); }
  });
  document.getElementById('fca-inst-plus').addEventListener('click', () => {
    if (installCount < 60) { installCount++; syncInstDisplay(); }
  });

  document.getElementById('fca-submit').addEventListener('click', handleSubmit);
  window.addEventListener('gastinhos:edit-tx', e => openEditFCA(e.detail));

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
    populateCatSelect([...ranked, ...rest]);
  } catch {}
}

function populateCatSelect(order = ALL_CATS) {
  const sel = document.getElementById('fca-cat-select');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Selecione —</option>' +
    order.map(c => `<option value="${c}">${c}</option>`).join('');
  if (prev && order.includes(prev)) sel.value = prev;
}

function updateInstCtrl() {
  const isCredit = currentPay === 'Crédito';
  document.getElementById('fca-inst-ctrl').classList.toggle('disabled', !isCredit);
  if (!isCredit && installCount !== 1) { installCount = 1; syncInstDisplay(); }
}

function syncInstDisplay() {
  document.getElementById('fca-inst-display').textContent = installCount;
  updateInstallmentCalc();
}

function buildPersonChips() {
  const me = localStorage.getItem('gastinhos_default_person') || '';
  const other = me === 'Felipe' ? 'Teresa' : me === 'Teresa' ? 'Felipe' : '';
  const defs = me
    ? [{ label: 'Eu', val: me }, { label: other, val: other }, { label: 'Casal', val: 'Casal' }]
    : [{ label: 'Felipe', val: 'Felipe' }, { label: 'Teresa', val: 'Teresa' }, { label: 'Casal', val: 'Casal' }];
  document.getElementById('fca-person-chips').innerHTML =
    defs.map(c => `<button class="chip" data-val="${c.val}">${c.label}</button>`).join('');
}

function openFCA() {
  buildPersonChips();
  const mem = (() => { try { return JSON.parse(localStorage.getItem(MEM_KEY)) || {}; } catch { return {}; } })();
  amountCents = 0; editId = null; installCount = 1;

  document.getElementById('fca-amount').value = '';
  document.getElementById('fca-description').value = '';
  document.getElementById('fca-date').value = todayStr();
  document.getElementById('fca-inst-display').textContent = '1';
  document.getElementById('fca-inst-summary').textContent = '';

  const defaultPerson = localStorage.getItem('gastinhos_default_person') || '';
  currentPerson = mem.person || defaultPerson;
  document.querySelectorAll('#fca-person-chips .chip').forEach(c =>
    c.classList.toggle('active', c.dataset.val === currentPerson));

  document.getElementById('fca-cat-select').value = mem.cat || '';

  currentPay = 'Crédito';
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
  document.getElementById('fca-description').value = tx.description || '';
  document.getElementById('fca-cat-select').value = tx.category || '';

  currentPerson = tx.person || '';
  document.querySelectorAll('#fca-person-chips .chip').forEach(c =>
    c.classList.toggle('active', c.dataset.val === currentPerson));

  currentPay = tx.payment_method || 'Crédito';
  document.querySelectorAll('#fca-pay-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.val === currentPay));
  updateInstCtrl();

  installCount = tx.installment_total || 1;
  document.getElementById('fca-inst-display').textContent = installCount;

  updateInstallmentCalc();
  document.getElementById('fca-submit').textContent = 'Salvar alterações';
  updateSubmitState();
}

function closeFCA() {
  document.getElementById('fca-overlay').classList.add('hidden');
}

function updateSubmitState() {
  const ok = (amountCents / 100) > 0 && currentPerson && document.getElementById('fca-cat-select').value;
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
  const cat = document.getElementById('fca-cat-select').value;
  const n = currentPay === 'Crédito' ? installCount : 1;
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = todayStr();

  const btn = document.getElementById('fca-submit');
  btn.disabled = true; btn.textContent = 'Salvando…';

  try {
    if (editId) {
      const status = dateStr > today ? 'provisao' : 'realizado';
      await updateTx(editId, {
        date: dateStr, amount, category: cat, person: currentPerson,
        description: desc, payment_method: currentPay || null, status
      });
      showToast('Alterações salvas');
    } else if (n <= 1) {
      const status = dateStr > today ? 'provisao' : 'realizado';
      await addTx({ date: dateStr, type: 'expense', amount, category: cat,
        person: currentPerson, description: desc, payment_method: currentPay || null, status });
      showToast(status === 'provisao' ? 'Provisão registrada' : 'Lançamento salvo');
    } else {
      const groupId = crypto.randomUUID();
      const perAmount = Math.round(amount / n * 100) / 100;
      const rows = Array.from({ length: n }, (_, i) => {
        const dt = addMonths(y, m, i);
        const dateI = `${dt.year}-${String(dt.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const status = dateI > today ? 'provisao' : 'realizado';
        return { date: dateI, type: 'expense', amount: perAmount, category: cat,
          person: currentPerson, description: desc, payment_method: 'Crédito',
          installment_current: i + 1, installment_total: n, installment_group_id: groupId, status };
      });
      await addTxBatch(rows);
      showToast(`${n} parcelas criadas`);
    }
    localStorage.setItem(MEM_KEY, JSON.stringify({ person: currentPerson, cat }));
    closeFCA();
    window.dispatchEvent(new CustomEvent('gastinhos:tx-saved'));
  } catch (e) {
    showToast('Erro ao salvar: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = editId ? 'Salvar alterações' : 'Lançar';
  }
}
