let sb;
export function init(client) { sb = client; }

export async function getTx({ start, end, person, status } = {}) {
  let q = sb.from('transactions').select('*').eq('type', 'expense').order('date', { ascending: false });
  if (start) q = q.gte('date', start);
  if (end) q = q.lte('date', end);
  if (person) q = q.eq('person', person);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function addTx(row) {
  const { data, error } = await sb.from('transactions').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function addTxBatch(rows) {
  const { data, error } = await sb.from('transactions').insert(rows).select();
  if (error) throw error;
  return data;
}

export async function deleteTx(id) {
  const { error } = await sb.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

export async function updateTx(id, updates) {
  const { data, error } = await sb.from('transactions').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteGroup(groupId, fromDate) {
  let q = sb.from('transactions').delete().eq('installment_group_id', groupId);
  if (fromDate) q = q.gte('date', fromDate);
  const { error } = await q;
  if (error) throw error;
}

export async function getBudget() {
  try {
    const { data } = await sb.from('settings').select('value').eq('key', 'monthly_budget').single();
    return data ? parseFloat(data.value) : 25000;
  } catch { return 25000; }
}

export async function setBudget(value) {
  const { error } = await sb.from('settings').upsert({
    key: 'monthly_budget',
    value: String(value),
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

export async function getMonthlyTotals(months, person) {
  const { getMonthRange } = await import('./utils.js');
  const results = [];
  for (const { year, month } of months) {
    const { start, end } = getMonthRange(year, month);
    let q = sb.from('transactions').select('status, amount').eq('type', 'expense').gte('date', start).lte('date', end);
    if (person) q = q.eq('person', person);
    const { data } = await q;
    const rows = data || [];
    const realizado = rows.filter(r => r.status !== 'provisao').reduce((s, r) => s + Number(r.amount), 0);
    const provisao = rows.filter(r => r.status === 'provisao').reduce((s, r) => s + Number(r.amount), 0);
    results.push({ year, month, realizado, provisao, expense: realizado + provisao });
  }
  return results;
}

export async function getGrouped(start, end, dimension, person) {
  let q = sb.from('transactions').select('*').eq('type', 'expense').gte('date', start).lte('date', end);
  if (person) q = q.eq('person', person);
  const { data } = await q;
  const rows = data || [];
  const map = {};
  for (const r of rows) {
    const key = dimension === 'month' ? r.date.slice(0, 7) :
                dimension === 'category' ? (r.category || 'Sem categoria') :
                dimension === 'person' ? r.person :
                r.payment_method || 'Outro';
    if (!map[key]) map[key] = { sum: 0, count: 0 };
    map[key].sum += Number(r.amount);
    map[key].count += 1;
  }
  return map;
}
