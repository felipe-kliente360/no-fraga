import { getGrouped, getMonthlyTotals } from './db.js';
import { formatBRL, lastNMonths, monthLabel, addMonths } from './utils.js';

let anChart;
let currentPerson = '';
let currentChartType = 'bar-h';

export function setAnalisePerson(p) { currentPerson = p; }
export function getAnalisePerson() { return currentPerson; }

export async function loadAnalise() {
  const dim = document.getElementById('an-dimension').value;
  const metric = document.getElementById('an-metric').value;
  const period = parseInt(document.getElementById('an-period').value);
  const chartType = document.getElementById('an-chart-type')?.value || currentChartType;
  currentChartType = chartType;
  const { start, end } = lastNMonths(period);

  let map;
  if (dim === 'month') {
    const now = new Date();
    const months = Array.from({length:period},(_,i)=>addMonths(now.getFullYear(), now.getMonth()+1, i-period+1));
    const totals = await getMonthlyTotals(months, currentPerson || undefined);
    map = {};
    totals.forEach(t => { map[`${t.year}-${String(t.month).padStart(2,'0')}`] = { sum: t.expense, count: 0, avg: 0 }; });
  } else {
    const raw = await getGrouped(start, end, dim, currentPerson || undefined);
    map = Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,{sum:v.sum,count:v.count,avg:v.count?v.sum/v.count:0}]));
  }

  const metricKey = metric === 'count' ? 'count' : metric === 'avg' ? 'avg' : 'sum';
  const entries = Object.entries(map).sort((a,b) => b[1][metricKey] - a[1][metricKey]);
  const labels = entries.map(([k]) => dim === 'month' ? monthLabel(...k.split('-').map(Number)) : k);
  const values = entries.map(([,v]) => metric === 'count' ? v.count : metric === 'avg' ? v.avg : v.sum);
  const total = values.reduce((s,v) => s+v, 0);

  const COLORS = ['#A5B4FC','#86EFAC','#FCA5A5','#FCD34D','#67E8F9','#F0ABFC','#6EE7B7','#93C5FD','#D1D5DB','#FDBA74'];

  if (anChart) { anChart.destroy(); anChart = null; }
  const ctx = document.getElementById('an-chart');

  const fmtLabel = (val) => metric === 'count' ? `${val} transações` : formatBRL(val);

  if (chartType === 'treemap' && window.Chart?.controllers?.treemap) {
    anChart = new Chart(ctx, {
      type: 'treemap',
      data: {
        datasets: [{
          data: entries.map(([k,v]) => ({ key: k, value: metric === 'count' ? v.count : metric === 'avg' ? v.avg : v.sum })),
          key: 'value',
          labels: { display: true, formatter: (c) => [c.raw._data.key, fmtLabel(c.raw._data.value)] },
          backgroundColor: (c) => COLORS[c.dataIndex % COLORS.length],
          spacing: 2, borderWidth: 0,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (items) => items[0].raw._data.key, label: (item) => ` ${fmtLabel(item.raw.v)}` } }
        }
      }
    });
  } else if (chartType === 'doughnut' || chartType === 'pie') {
    anChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: COLORS, borderWidth: 0, cutout: '65%', hoverOffset: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmtLabel(c.raw)}` } } }
      }
    });
  } else if (chartType === 'radar') {
    anChart = new Chart(ctx, {
      type: 'radar',
      data: { labels, datasets: [{ data: values, backgroundColor: 'rgba(99,102,241,0.2)', borderColor: '#6366F1', borderWidth: 2, pointBackgroundColor: COLORS }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmtLabel(c.raw)}` } } },
        scales: { r: { ticks: { callback: v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v } } }
      }
    });
  } else if (chartType === 'polar') {
    anChart = new Chart(ctx, {
      type: 'polarArea',
      data: { labels, datasets: [{ data: values, backgroundColor: COLORS.map(c => c + 'CC'), borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmtLabel(c.raw)}` } } }
      }
    });
  } else {
    // bar-h or bar-v
    const isHoriz = chartType === 'bar-h';
    anChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data: values, backgroundColor: COLORS, borderRadius: 4, borderWidth: 0, borderSkipped: false }] },
      options: {
        indexAxis: isHoriz ? 'y' : 'x',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmtLabel(c.raw)}` } } },
        scales: {
          x: { grid: { display: isHoriz }, ticks: { callback: v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v } },
          y: { grid: { display: !isHoriz }, ticks: { callback: isHoriz ? undefined : (v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v) } }
        }
      }
    });
  }

  const tbody = document.getElementById('an-table');
  tbody.innerHTML = `<thead><tr><th class="analise-rank">#</th><th>Rótulo</th><th style="text-align:right">${metric==='count'?'Nº':'Valor'}</th><th class="analise-pct">%</th></tr></thead><tbody>` +
    entries.slice(0,10).map(([k,v],i) => `<tr><td class="analise-rank">${i+1}</td><td>${dim==='month'?monthLabel(...k.split('-').map(Number)):k}</td><td style="text-align:right;font-weight:600">${metric==='count'?v.count:formatBRL(metric==='avg'?v.avg:v.sum)}</td><td class="analise-pct">${total>0?((metricKey==='count'?v.count:v[metricKey])/total*100).toFixed(1):0}%</td></tr>`).join('') +
    '</tbody>';
}

export function initAnalise() {
  ['an-dimension','an-metric','an-period','an-chart-type'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', loadAnalise);
  });
}
