import { getTx, deleteTx, deleteGroup } from './db.js';
import { formatDate, formatBRL, showToast } from './utils.js';

let txData = [];
let sortCol = 'date';
let sortDir = 'desc';
let filterPerson = '';
let filterFrom = '';
let filterTo = '';
let filterCat = new Set();
let filterPay = new Set();
let searchTerm = '';

export function setHistoricoPerson(p) { filterPerson = p; }
export function getHistoricoPerson() { return filterPerson; }

export function getActiveFilterCount() {
  return filterCat.size + filterPay.size + (searchTerm.trim() ? 1 : 0);
}

export function clearHistoricoFilters() {
  filterCat = new Set();
  filterPay = new Set();
  searchTerm = '';
  document.querySelectorAll('#hist-cat-chips .chip.active, #hist-pay-chips .chip.active')
    .forEach(c => c.classList.remove('active'));
  const s = document.getElementById('hist-search');
  if (s) s.value = '';
  renderTable();
}

function updateFilterBadge() {
  const btn = document.getElementById('hist-clear-btn');
  if (!btn) return;
  const n = getActiveFilterCount();
  btn.classList.toggle('hidden', n === 0);
  const cnt = btn.querySelector('.hist-clear-count');
  if (cnt) cnt.textContent = n;
}

export function initHistorico() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('hist-date-from').value = ym;
  document.getElementById('hist-date-to').value = ym;
  filterFrom = ym;
  filterTo = ym;

  // Categoria/Pagamento são multisseleção (chips toggle), aplicados no "Aplicar"
  document.getElementById('hist-cat-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-val]'); if (btn) btn.classList.toggle('active');
  });
  document.getElementById('hist-pay-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-val]'); if (btn) btn.classList.toggle('active');
  });

  document.getElementById('hist-apply').onclick = () => {
    filterCat = new Set([...document.querySelectorAll('#hist-cat-chips .chip.active')].map(c => c.dataset.val));
    filterPay = new Set([...document.querySelectorAll('#hist-pay-chips .chip.active')].map(c => c.dataset.val));
    document.getElementById('hist-filter-bar').classList.remove('open');
    loadHistorico();
  };

  document.getElementById('hist-search').addEventListener('input', e => { searchTerm = e.target.value; renderTable(); });

  document.querySelectorAll('.hist-table th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      if (sortCol === th.dataset.col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortCol = th.dataset.col; sortDir = 'desc'; }
      renderTable();
    });
  });

  // Close ctx menu on outside click
  document.addEventListener('click', () => {
    document.getElementById('hist-ctx-menu')?.classList.remove('open');
  });

  loadHistorico();
}

export async function loadHistorico() {
  filterFrom = document.getElementById('hist-date-from').value;
  filterTo = document.getElementById('hist-date-to').value;
  const start = filterFrom ? filterFrom + '-01' : undefined;
  const end = filterTo ? (() => { const [y, m] = filterTo.split('-'); return new Date(+y, +m, 0).toISOString().slice(0, 10); })() : undefined;
  try {
    txData = await getTx({ start, end, person: filterPerson || undefined });
    renderTable();
  } catch (e) { showToast('Erro ao carregar histórico', 'error'); }
}

function renderTable() {
  // Client-side filters: category, payment and free-text search (matches across
  // the underlying fields, not just what's shown — description, category, person, pagamento)
  const words = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = txData.filter(r => {
    if (filterCat.size && !filterCat.has(r.category)) return false;
    if (filterPay.size && !filterPay.has(r.payment_method)) return false;
    if (words.length) {
      const hay = [r.description, r.category, r.person, r.payment_method].join(' ').toLowerCase();
      if (!words.every(w => hay.includes(w))) return false;
    }
    return true;
  });

  // Realtime summary of what's being shown
  document.getElementById('hist-count').textContent = filtered.length;
  document.getElementById('hist-total').textContent = formatBRL(filtered.reduce((s, r) => s + Number(r.amount), 0));
  updateFilterBadge();

  const sorted = filtered.sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (sortCol === 'amount') { va = Number(va); vb = Number(vb); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  document.querySelectorAll('.hist-table th[data-col]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === sortCol) th.classList.add(`sort-${sortDir}`);
  });

  const tbody = document.getElementById('hist-tbody');
  const empty = document.getElementById('hist-empty');
  if (!sorted.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  tbody.innerHTML = sorted.map(r => `
    <tr data-id="${r.id}" class="tx-row${r.status === 'provisao' ? ' tx-provisao' : ''}">
      <td>${formatDate(r.date)}</td>
      <td>${r.category || '—'}</td>
      <td style="text-align:right"><span class="tx-amount ${r.status === 'provisao' ? 'provisao-val' : 'expense'}">${formatBRL(r.amount)}</span></td>
      <td><span class="tx-desc">${r.description || '—'}</span>${r.installment_total ? `<span class="inst-badge">${r.installment_current}/${r.installment_total}</span>` : ''}${r.status === 'provisao' ? '<span class="provisao-badge">Prov</span>' : ''}</td>
      <td style="text-align:center"><span class="person-pill" title="${r.person}">${(r.person || '')[0] || ''}</span></td>
      <td><button class="row-dots-btn" data-id="${r.id}" data-group="${r.installment_group_id || ''}" data-date="${r.date}">⋮</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.row-dots-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const group = btn.dataset.group;
      const date = btn.dataset.date;
      const tx = txData.find(r => String(r.id) === String(id));
      const menu = document.getElementById('hist-ctx-menu');

      const groupBtn = document.getElementById('ctx-delete-group');
      groupBtn.style.display = group ? 'flex' : 'none';

      document.getElementById('ctx-edit').onclick = () => {
        menu.classList.remove('open');
        if (tx) window.dispatchEvent(new CustomEvent('gastinhos:edit-tx', { detail: tx }));
      };
      document.getElementById('ctx-delete').onclick = async () => {
        menu.classList.remove('open');
        await deleteTx(id);
        showToast('Transação excluída');
        loadHistorico();
      };
      if (group) {
        groupBtn.onclick = async () => {
          menu.classList.remove('open');
          await deleteGroup(group, date);
          showToast('Parcelas excluídas');
          loadHistorico();
        };
      }

      // Smart positioning: open up if near bottom
      const rect = btn.getBoundingClientRect();
      const menuH = group ? 132 : 88;
      const spaceBelow = window.innerHeight - rect.bottom;

      menu.style.right = '12px';
      menu.style.left = 'auto';
      if (spaceBelow < menuH + 16) {
        menu.style.top = 'auto';
        menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      } else {
        menu.style.bottom = 'auto';
        menu.style.top = `${rect.bottom + 4}px`;
      }
      menu.classList.add('open');
    });
  });
}
