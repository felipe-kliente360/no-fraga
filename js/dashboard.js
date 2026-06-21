import { getTx, getMonthlyTotals } from './db.js';
import { formatBRL, monthLabel, getMonthRange, addMonths, lastNMonths, showToast } from './utils.js';

let chartInstances = {};
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let currentPerson = '';

const CHART_COLORS = {
  income: '#86EFAC',
  expense: '#FCA5A5',
  cats: ['#A5B4FC','#86EFAC','#FCA5A5','#FCD34D','#67E8F9','#F0ABFC','#6EE7B7','#FCA5A5','#93C5FD','#D1D5DB'],
  persons: { Felipe: '#A5B4FC', Teresa: '#86EFAC', Casal: '#FCD34D' }
};

export function initDashboard() {
  renderHeader();
}

function renderHeader() {
  const ctrl = document.getElementById('header-controls');
  ctrl.innerHTML = `
    <div class="period-selector">
      <button id="dash-prev"><i data-lucide="chevron-left"></i></button>
      <span class="period-label" id="dash-period-label"></span>
      <button id="dash-next"><i data-lucide="chevron-right"></i></button>
    </div>
    <button class="btn btn-ghost" id="dash-person-btn" title="Filtrar pessoa"><i data-lucide="users"></i></button>
    <div class="person-filter-popover" id="dash-person-popover">
      ${['','Felipe','Teresa','Casal'].map(p=>`<div class="pf-option${p===currentPerson?' active':''}" data-p="${p}">${p||'Todos'}</div>`).join('')}
    </div>
  `;
  lucide.createIcons();
  updatePeriodLabel();
  document.getElementById('dash-prev').onclick = () => { const r = addMonths(currentYear, currentMonth, -1); currentYear=r.year; currentMonth=r.month; updatePeriodLabel(); loadDashboard(); };
  document.getElementById('dash-next').onclick = () => { const r = addMonths(currentYear, currentMonth, 1); currentYear=r.year; currentMonth=r.month; updatePeriodLabel(); loadDashboard(); };
  document.getElementById('dash-person-btn').onclick = (e) => { e.stopPropagation(); document.getElementById('dash-person-popover').classList.toggle('open'); };
  document.querySelectorAll('.pf-option').forEach(el => {
    el.onclick = () => { currentPerson = el.dataset.p; document.getElementById('dash-person-popover').classList.remove('open'); loadDashboard(); document.querySelectorAll('.pf-option').forEach(x=>x.classList.toggle('active', x.dataset.p===currentPerson)); };
  });
  document.addEventListener('click', () => document.getElementById('dash-person-popover')?.classList.remove('open'));
}

function updatePeriodLabel() {
  const label = document.getElementById('dash-period-label');
  if (label) label.textContent = monthLabel(currentYear, currentMonth);
}

export async function loadDashboard() {
  const { start, end } = getMonthRange(currentYear, currentMonth);
  let txCur, txPrev;
  try {
    txCur = await getTx({ start, end, person: currentPerson || undefined });
    const prev = addMonths(currentYear, currentMonth, -1);
    const pr = getMonthRange(prev.year, prev.month);
    txPrev = await getTx({ start: pr.start, end: pr.end, person: currentPerson || undefined });
  } catch(e) { showToast('Erro ao carregar dados', 'error'); return; }

  const income = txCur.filter(r=>r.type==='income').reduce((s,r)=>s+Number(r.amount),0);
  const expense = txCur.filter(r=>r.type==='expense').reduce((s,r)=>s+Number(r.amount),0);
  const saldo = income - expense;
  const savings = income > 0 ? (saldo / income * 100) : 0;
  const prevExpense = txPrev.filter(r=>r.type==='expense').reduce((s,r)=>s+Number(r.amount),0);
  const delta = prevExpense > 0 ? ((expense - prevExpense) / prevExpense * 100) : 0;

  const catMap = {};
  txCur.filter(r=>r.type==='expense').forEach(r=>{
    const c = r.category||'Outros'; catMap[c] = (catMap[c]||0) + Number(r.amount);
  });
  const topCat = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];

  // KPIs
  const kpiEl = document.getElementById('dash-kpis');
  kpiEl.innerHTML = `
    <div class="kpi-card" style="grid-column:span 2;background:${saldo>=0?'rgba(134,239,172,0.15)':'rgba(252,165,165,0.15)'}">
      <div class="kpi-label">Saldo do Mês</div>
      <div class="kpi-value ${saldo>=0?'positive':'negative'}">${formatBRL(saldo)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Taxa de Poupança</div>
      <div class="kpi-value">${savings.toFixed(1)}%</div>
      <div class="savings-bar-track"><div class="savings-bar-fill" style="width:${Math.min(100,Math.max(0,savings))}%"></div></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Δ vs Mês Ant.</div>
      <div class="kpi-value ${delta>0?'negative':delta<0?'positive':''}">${delta>0?'+':''}${delta.toFixed(1)}%</div>
      <div class="kpi-sub">${delta>0?'acima':'abaixo'} do mês passado</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Receitas</div>
      <div class="kpi-value income">${formatBRL(income)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Despesas</div>
      <div class="kpi-value expense">${formatBRL(expense)}</div>
    </div>
    ${topCat ? `<div class="kpi-card" style="grid-column:span 2">
      <div class="kpi-label">Maior Categoria</div>
      <div class="kpi-value">${topCat[0]}</div>
      <div class="kpi-sub">${formatBRL(topCat[1])} · ${expense>0?(topCat[1]/expense*100).toFixed(0):0}% das despesas</div>
    </div>` : ''}
  `;

  // Charts
  const chartsEl = document.getElementById('dash-charts');
  chartsEl.innerHTML = `
    <div class="chart-section">
      <div class="chart-header"><span class="chart-title">Receitas vs Despesas</span></div>
      <div class="chart-wrap"><div class="chart-canvas-wrap" style="height:180px"><canvas id="c-monthly"></canvas></div></div>
    </div>
    <div class="chart-section">
      <div class="chart-header"><span class="chart-title">Por Categoria</span></div>
      <div class="chart-wrap"><div class="chart-canvas-wrap" style="height:180px"><canvas id="c-cat"></canvas></div></div>
    </div>
    <div class="chart-section">
      <div class="chart-header"><span class="chart-title">Top Categorias</span></div>
      <div class="chart-wrap"><div class="chart-canvas-wrap" style="height:160px"><canvas id="c-top"></canvas></div></div>
    </div>
    <div class="chart-section">
      <div class="chart-header"><span class="chart-title">Por Pessoa</span></div>
      <div class="chart-wrap"><div class="chart-canvas-wrap" style="height:160px"><canvas id="c-person"></canvas></div></div>
    </div>
  `;

  // Destroy old charts
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};

  // Chart defaults
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
  Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim();

  // 1) Monthly bar (last 6 months)
  const months6 = Array.from({length:6},(_,i)=>addMonths(currentYear,currentMonth,i-5));
  const m6data = await getMonthlyTotals(months6);
  chartInstances.monthly = new Chart(document.getElementById('c-monthly'), {
    type: 'bar',
    data: {
      labels: m6data.map(m=>monthLabel(m.year,m.month).slice(0,3)),
      datasets: [
        { label:'Receitas', data: m6data.map(m=>m.income), backgroundColor: CHART_COLORS.income, borderRadius:6, borderSkipped:false },
        { label:'Despesas', data: m6data.map(m=>m.expense), backgroundColor: CHART_COLORS.expense, borderRadius:6, borderSkipped:false }
      ]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ grid:{display:false} }, y:{ grid:{ color:'rgba(0,0,0,0.04)' }, ticks:{ callback: v => v>=1000?`${(v/1000).toFixed(0)}k`:v } } } }
  });

  // 2) Category donut
  const catEntries = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  if (catEntries.length) {
    chartInstances.cat = new Chart(document.getElementById('c-cat'), {
      type: 'doughnut',
      data: { labels: catEntries.map(e=>e[0]), datasets: [{ data: catEntries.map(e=>e[1]), backgroundColor: CHART_COLORS.cats, borderWidth: 0, hoverOffset: 4 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'68%', plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}: ${formatBRL(ctx.raw)}` } } } }
    });
  }

  // 3) Top 5 horizontal bar
  const top5 = catEntries.slice(0,5);
  if (top5.length) {
    chartInstances.top = new Chart(document.getElementById('c-top'), {
      type: 'bar',
      data: { labels: top5.map(e=>e[0]), datasets: [{ data: top5.map(e=>e[1]), backgroundColor: CHART_COLORS.cats.slice(0,5), borderRadius:6, borderSkipped:false }] },
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ grid:{display:false}, ticks:{callback: v=>v>=1000?`${(v/1000).toFixed(0)}k`:v} }, y:{ grid:{display:false} } } }
    });
  }

  // 4) Per person bar
  const persons = ['Felipe','Teresa','Casal'];
  const personData = persons.map(p => txCur.filter(r=>r.person===p&&r.type==='expense').reduce((s,r)=>s+Number(r.amount),0));
  chartInstances.person = new Chart(document.getElementById('c-person'), {
    type: 'bar',
    data: { labels: persons, datasets: [{ data: personData, backgroundColor: persons.map(p=>CHART_COLORS.persons[p]), borderRadius:6, borderSkipped:false }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ grid:{display:false} }, y:{ grid:{color:'rgba(0,0,0,0.04)'}, ticks:{callback: v=>v>=1000?`${(v/1000).toFixed(0)}k`:v} } } }
  });
}

// re-export getMonthlyTotals for analise tab
export { getMonthlyTotals };
