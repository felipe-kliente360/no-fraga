export function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
export function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}`;
}
export function formatDateFull(d) {
  if (!d) return '';
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const [y, m, day] = d.split('-');
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}
export function monthLabel(y, m) {
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${months[m-1]} ${y}`;
}
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
export function getMonthRange(y, m) {
  const start = `${y}-${String(m).padStart(2,'0')}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0,10);
  return { start, end };
}
export function addMonths(y, m, n) {
  const d = new Date(y, m - 1 + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
export function lastNMonths(n) {
  const now = new Date();
  const end = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const s = addMonths(end.year, end.month, -(n - 1));
  return { start: getMonthRange(s.year, s.month).start, end: getMonthRange(end.year, end.month).end };
}
export function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}
export function exportCSV(rows, filename) {
  const headers = ['Data','Status','Valor','Categoria','Pessoa','Descrição','Pagamento','Parcela'];
  const lines = [headers.join(','), ...rows.map(r => [
    r.date, r.status || 'realizado', r.amount, r.category || '', r.person,
    `"${(r.description||'').replace(/"/g,'""')}"`,
    r.payment_method || '',
    r.installment_total ? `${r.installment_current}/${r.installment_total}` : ''
  ].join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
