import { getGrouped, getMonthlyTotals } from './db.js';
import { formatBRL, lastNMonths, monthLabel, addMonths } from './utils.js';

let anChart;

export async function loadAnalise() {
  const dim = document.getElementById('an-dimension').value;
  const metric = document.getElementById('an-metric').value;
  const period = parseInt(document.getElementById('an-period').value);
  const { start, end } = lastNMonths(period);

  let map;
  if (dim === 'month') {
    const now = new Date();
    const months = Array.from({length:period},(_,i)=>addMonths(now.getFullYear(), now.getMonth()+1, i-period+1));
    const totals = await getMonthlyTotals(months);
    map = {};
    totals.forEach(t => { map[`${t.year}-${String(t.month).padStart(2,'0')}`] = { sum: t.expense, count: 0, avg: 0 }; });
  } else {
    const raw = await getGrouped(start, end, dim, 'expense');
    map = Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,{sum:v.sum,count:v.count,avg:v.count?v.sum/v.count:0}]));
  }

  const entries = Object.entries(map).sort((a,b)=>b[1][metric==='count'?'count':metric==='avg'?'avg':'sum'] - a[1][metric==='count'?'count':metric==='avg'?'avg':'sum']);
  const labels = entries.map(([k])=> dim==='month' ? monthLabel(...k.split('-').map(Number)) : k);
  const values = entries.map(([,v])=> metric==='count' ? v.count : metric==='avg' ? v.avg : v.sum);
  const total = values.reduce((s,v)=>s+v,0);

  const COLORS = ['#A5B4FC','#86EFAC','#FCA5A5','#FCD34D','#67E8F9','#F0ABFC','#6EE7B7','#93C5FD','#D1D5DB','#FCA5A5'];

  if (anChart) anChart.destroy();
  const ctx = document.getElementById('an-chart');
  const isDoughnut = ['category','payment_method'].includes(dim);
  anChart = new Chart(ctx, {
    type: isDoughnut ? 'doughnut' : 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: isDoughnut ? COLORS : '#A5B4FC',
        borderRadius: isDoughnut ? 0 : 6,
        borderWidth: 0,
        cutout: isDoughnut ? '65%' : undefined,
        hoverOffset: isDoughnut ? 4 : undefined,
        borderSkipped: isDoughnut ? undefined : false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => metric==='count' ? ` ${ctx.raw} transações` : ` ${formatBRL(ctx.raw)}` } } },
      scales: isDoughnut ? {} : { x:{ grid:{display:false} }, y:{ grid:{color:'rgba(0,0,0,0.04)'} } }
    }
  });

  const tbody = document.getElementById('an-table');
  tbody.innerHTML = `<thead><tr><th class="analise-rank">#</th><th>Rótulo</th><th style="text-align:right">${metric==='count'?'Nº':'Valor'}</th><th class="analise-pct">%</th></tr></thead><tbody>` +
    entries.slice(0,10).map(([k,v],i)=>`<tr><td class="analise-rank">${i+1}</td><td>${dim==='month'?monthLabel(...k.split('-').map(Number)):k}</td><td style="text-align:right;font-weight:600">${metric==='count'?v.count:formatBRL(metric==='avg'?v.avg:v.sum)}</td><td class="analise-pct">${total>0?((metric==='count'?v.count:metric==='avg'?v.avg:v.sum)/total*100).toFixed(1):0}%</td></tr>`).join('') +
    '</tbody>';
}

export function initAnalise() {
  ['an-dimension','an-metric','an-period'].forEach(id => document.getElementById(id).addEventListener('change', loadAnalise));
}
