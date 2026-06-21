let sb; // supabase client, set via init()
export function init(client) { sb = client; }

export async function getTx({ start, end, person, type } = {}) {
  let q = sb.from('transactions').select('*').order('date', { ascending: false });
  if (start) q = q.gte('date', start);
  if (end) q = q.lte('date', end);
  if (person) q = q.eq('person', person);
  if (type) q = q.eq('type', type);
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

export async function deleteGroup(groupId, fromDate) {
  let q = sb.from('transactions').delete().eq('installment_group_id', groupId);
  if (fromDate) q = q.gte('date', fromDate);
  const { error } = await q;
  if (error) throw error;
}

export async function getMonthlyTotals(months) {
  // months: array of {year, month}
  const { getMonthRange } = await import('./utils.js');
  const results = [];
  for (const { year, month } of months) {
    const { start, end } = getMonthRange(year, month);
    const { data } = await sb.from('transactions').select('type, amount').gte('date', start).lte('date', end);
    const income = (data||[]).filter(r=>r.type==='income').reduce((s,r)=>s+Number(r.amount),0);
    const expense = (data||[]).filter(r=>r.type==='expense').reduce((s,r)=>s+Number(r.amount),0);
    results.push({ year, month, income, expense });
  }
  return results;
}

export async function getGrouped(start, end, dimension, type = 'expense') {
  let q = sb.from('transactions').select('*').gte('date', start).lte('date', end);
  if (type) q = q.eq('type', type);
  const { data } = await q;
  const rows = data || [];
  const map = {};
  for (const r of rows) {
    const key = dimension === 'month' ? r.date.slice(0,7) :
                dimension === 'category' ? (r.category || 'Sem categoria') :
                dimension === 'person' ? r.person :
                r.payment_method || 'Outro';
    if (!map[key]) map[key] = { sum: 0, count: 0 };
    map[key].sum += Number(r.amount);
    map[key].count += 1;
  }
  return map;
}
