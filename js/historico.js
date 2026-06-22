import { getTx, deleteTx, deleteGroup } from './db.js';
import { formatDate, formatBRL, showToast, exportCSV, monthLabel } from './utils.js';

let txData = [];
let sortCol = 'date';
let sortDir = 'desc';
let filterPerson = '';
let filterStatus = '';
let filterFrom = '';
let filterTo = '';

export function setHistoricoPerson(p) { filterPerson = p; }
export function getHistoricoPerson() { return filterPerson; }

export function initHistorico() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('hist-date-from').value = ym;
  document.getElementById('hist-date-to').value = ym;
  filterFrom = ym;
  filterTo = ym;

  // status chips
  document.getElementById('hist-status-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-val]');
    if (!btn) return;
    document.querySelectorAll('#hist-status-chips .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    filterStatus = btn.dataset.val;
  });

  document.getElementById('hist-apply').onclick = loadHistorico;

  // sort
  document.querySelectorAll('.hist-table th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      if (sortCol === th.dataset.col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortCol = th.dataset.col; sortDir = 'desc'; }
      renderTable();
    });
  });

  loadHistorico();
}

export async function loadHistorico() {
  filterFrom = document.getElementById('hist-date-from').value;
  filterTo = document.getElementById('hist-date-to').value;
  const start = filterFrom ? filterFrom + '-01' : undefined;
  const end = filterTo ? (() => { const [y, m] = filterTo.split('-'); return new Date(+y, +m, 0).toISOString().slice(0, 10); })() : undefined;
  try {
    txData = await getTx({ start, end, person: filterPerson || undefined, status: filterStatus || undefined });
    renderTable();
  } catch (e) { showToast('Erro ao carregar histórico', 'error'); }
}

function renderTable() {
  const sorted = [...txData].sort((a, b) => {
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
    <tr data-id="${r.id}" data-group="${r.installment_group_id || ''}" data-date="${r.date}" class="tx-row${r.status === 'provisao' ? ' tx-provisao' : ''}">
      <td>${formatDate(r.date)}</td>
      <td><span class="tx-desc">${r.description || r.category || '—'}</span>${r.installment_total ? `<span class="inst-badge">${r.installment_current}/${r.installment_total}</span>` : ''}${r.status === 'provisao' ? '<span class="provisao-badge">Prov</span>' : ''}</td>
      <td><span class="person-pill">${r.person}</span></td>
      <td style="text-align:right"><span class="tx-amount ${r.status === 'provisao' ? 'provisao-val' : 'expense'}">${formatBRL(r.amount)}</span></td>
      <td><button class="row-dots-btn" data-id="${r.id}">⋮</button></td>
    </tr>
    <tr class="action-row" data-for="${r.id}" style="display:none">
      <td colspan="5">
        <div style="display:flex;gap:8px;padding:8px 12px;background:var(--surface-raised)">
          <button class="act-edit" data-id="${r.id}" style="font-size:13px;color:var(--accent-fg);background:none;border:none;cursor:pointer;padding:4px 8px">Editar</button>
          <button class="del-one" data-id="${r.id}" style="font-size:13px;color:#EF4444;background:none;border:none;cursor:pointer;padding:4px 8px">Excluir</button>
          ${r.installment_group_id ? `<button class="del-group" data-group="${r.installment_group_id}" data-date="${r.date}" style="font-size:13px;color:#EF4444;background:none;border:none;cursor:pointer;padding:4px 8px">Excluir esta e próximas</button>` : ''}
          <button class="act-cancel" data-id="${r.id}" style="font-size:13px;color:var(--text-2);background:none;border:none;cursor:pointer;padding:4px 8px;margin-left:auto">Cancelar</button>
        </div>
      </td>
    </tr>
  `).join('');

  // row-dots button toggles action row
  tbody.querySelectorAll('.row-dots-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const actionRow = tbody.querySelector(`.action-row[data-for="${id}"]`);
      if (actionRow.style.display === 'none') {
        tbody.querySelectorAll('.action-row').forEach(r => r.style.display = 'none');
        actionRow.style.display = '';
      } else {
        actionRow.style.display = 'none';
      }
    });
  });

  // Edit button
  tbody.querySelectorAll('.act-edit').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const id = btn.dataset.id;
    const tx = txData.find(r => String(r.id) === String(id));
    if (tx) window.dispatchEvent(new CustomEvent('gastinhos:edit-tx', { detail: tx }));
  }));

  tbody.querySelectorAll('.del-one').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    await deleteTx(btn.dataset.id);
    showToast('Transação excluída');
    loadHistorico();
  }));
  tbody.querySelectorAll('.del-group').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    await deleteGroup(btn.dataset.group, btn.dataset.date);
    showToast('Parcelas excluídas');
    loadHistorico();
  }));
  tbody.querySelectorAll('.act-cancel').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    tbody.querySelector(`.action-row[data-for="${btn.dataset.id}"]`).style.display = 'none';
  }));
}
