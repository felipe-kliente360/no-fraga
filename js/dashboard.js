import { getTx, getMonthlyTotals, getBudget } from './db.js';
import { formatBRL, monthLabel, getMonthRange, addMonths, showToast } from './utils.js';

let chartInstances = {};
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let currentPerson = '';

const COLORS = {
  cats: ['#A5B4FC','#86EFAC','#FCA5A5','#FCD34D','#67E8F9','#F0ABFC','#6EE7B7','#93C5FD','#D1D5DB','#FDBA74'],
  persons: { Felipe: '#A5B4FC', Teresa: '#86EFAC', Casal: '#FCD34D' }
};

export function initDashboard() { renderHeader(); }

function renderHeader() {
  const ctrl = document.getElementById('header-controls');
  ctrl.innerHTML = `
    <div class="period-selector">
      <button id="dash-prev"><i data-lucide="chevron-left"></i></button>
      <span class="period-label" id="dash-period-label"></span>
      <button id="dash-next"><i data-lucide="chevron-right"></i></button>
    </div>
    <button class="btn btn-ghost" id="dash-person-btn"><i data-lucide="users"></i></button>
    <div class="person-filter-popover" id="dash-person-popover">
      ${['','Felipe','Teresa','Casal'].map(p =>
        `<div class="pf-option${p===currentPerson?' active':''}" data-p="${p}">${p||'Todos'}</div>`
      ).join('')}
    </div>`;
  lucide.createIcons();
  updatePeriodLabel();
  document.getElementById('dash-prev').onclick = () => { const r=addMonths(currentYear,currentMonth,-1); currentYear=r.year; currentMonth=r.month; updatePeriodLabel(); loadDashboard(); };
  document.getElementById('dash-next').onclick = () => { const r=addMonths(currentYear,currentMonth,1); currentYear=r.year; currentMonth=r.month; updatePeriodLabel(); loadDashboard(); };
  document.getElementById('dash-person-btn').onclick = e => { e.stopPropagation(); document.getElementById('dash-person-popover').classList.toggle('open'); };
  document.querySelectorAll('.pf-option').forEach(el => {
    el.onclick = () => { currentPerson=el.dataset.p; document.getElementById('dash-person-popover').classList.remove('open'); document.querySelectorAll('.pf-option').forEach(x=>x.classList.toggle('active',x.dataset.p===currentPerson)); loadDashboard(); };
  });
  document.addEventListener('click', () => document.getElementById('dash-person-popover')?.classList.remove('open'));
}

function updatePeriodLabel() {
  const el = document.getElementById('dash-period-label');
  if (el) el.textContent = monthLabel(currentYear, currentMonth);
}

export async function loadDashboard() {
  const { start, end } = getMonthRange(currentYear, currentMonth);
  let tx, budget;
  try {
    [tx, budget] = await Promise.all([
      getTx({ start, end, person: currentPerson || undefined }),
      getBudget()
    ]);
  } catch(e) { showToast('Erro ao carregar dados','error'); return; }

  const realizado = tx.filter(r=>r.status!=='provisao').reduce((s,r)=>s+Number(r.amount),0);
  const provisao  = tx.filter(r=>r.status==='provisao').reduce((s,r)=>s+Number(r.amount),0);
  const projetado = realizado + provisao;
  const disponivel = budget - projetado;
  const pctReal = budget>0 ? Math.min(realizado/budget*100, 100) : 0;
  const pctProv = budget>0 ? Math.min(provisao/budget*100, 100-pctReal) : 0;
  const pctTotal = budget>0 ? projetado/budget*100 : 0;
  const criticalOver = realizado > budget;
  const overBudget   = projetado > budget;
  const barColor = pctTotal>=100 ? '#EF4444' : pctTotal>=80 ? '#F59E0B' : '#6366F1';
  const provColor = pctTotal>=100 ? 'rgba(239,68,68,0.3)' : pctTotal>=80 ? 'rgba(245,158,11,0.3)' : 'rgba(99,102,241,0.25)';

  const catMap = {};
  tx.forEach(r => { const c = r.category||'Outros'; catMap[c] = (catMap[c]||0) + Number(r.amount); });
  const catEntries = Object.entries(catMap).sort((a,b) => b[1]-a[1]);

  // Budget bar card (no KPI cards)
  const budgetLabel = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(budget);
  const realizadoLine = `<span style="color:var(--expense-fg);font-weight:600">${formatBRL(realizado)}</span><span style="color:var(--text-2)"> realizado</span>`;
  const provisaoLine  = provisao > 0 ? ` <span style="color:var(--text-2)">+</span> <span style="color:var(--text-2);font-weight:500">${formatBRL(provisao)}</span><span style="color:var(--text-2)"> provisão</span>` : '';
  document.getElementById('dash-kpis').innerHTML = `
    ${overBudget ? `<div class="budget-alert${criticalOver?' critical':''}" style="grid-column:span 2">
      <i data-lucide="${criticalOver?'alert-octagon':'triangle-alert'}"></i>
      <span>${criticalOver
        ? `Realizado excede o orçamento em ${formatBRL(realizado-budget)}`
        : `Projetado excede o orçamento em ${formatBRL(projetado-budget)}`
      }</span></div>` : ''}
    <div class="budget-bar-card" style="grid-column:span 2">
      <div class="budget-bar-header">
        <span class="kpi-label">Orçamento Mensal <span style="color:var(--text-3);font-weight:500">(${budgetLabel})</span></span>
        <span style="font-size:13px;font-weight:600;color:${barColor}">${pctTotal.toFixed(0)}%</span>
      </div>
      <div class="budget-bar-track">
        <div class="budget-bar-seg" style="width:${pctReal}%;background:${barColor}"></div>
        <div class="budget-bar-seg" style="width:${pctProv}%;background:${provColor}"></div>
      </div>
      <div style="margin-top:8px">
        <span style="font-size:13px;white-space:nowrap">${realizadoLine}${provisaoLine}</span>
      </div>
    </div>`;
  lucide.createIcons();

  const catHeight = Math.max(140, catEntries.length * 28);
  document.getElementById('dash-charts').innerHTML = `
    <div class="chart-section"><span class="chart-title">Despesas últimos 6 meses</span>
      <div class="chart-wrap"><div class="chart-canvas-wrap" style="height:200px"><canvas id="c-monthly"></canvas></div></div></div>
    <div class="chart-section"><span class="chart-title">Gastos por categoria</span>
      <div class="chart-wrap"><div class="chart-canvas-wrap" style="height:${catHeight}px"><canvas id="c-top"></canvas></div></div></div>
    <div class="chart-section"><span class="chart-title">Por pessoa</span>
      <div class="chart-wrap"><div class="chart-canvas-wrap" style="height:160px"><canvas id="c-person"></canvas></div></div></div>`;

  Object.values(chartInstances).forEach(c=>c.destroy()); chartInstances={};
  Chart.defaults.font.family="-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif";
  Chart.defaults.color=getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim()||'#888';

  // Monthly stacked bar + budget line
  const months6 = Array.from({length:6},(_,i)=>addMonths(currentYear,currentMonth,i-5));
  const m6 = await getMonthlyTotals(months6);
  chartInstances.monthly = new Chart(document.getElementById('c-monthly'), {
    data: {
      labels: m6.map(m=>monthLabel(m.year,m.month).slice(0,3)),
      datasets: [
        { type:'bar', label:'Realizado', data:m6.map(m=>m.realizado), backgroundColor:'rgba(99,102,241,0.75)',
          borderRadius:{topLeft:0,topRight:0,bottomLeft:6,bottomRight:6}, borderSkipped:false, stack:'total' },
        { type:'bar', label:'Provisão', data:m6.map(m=>m.provisao), backgroundColor:'rgba(99,102,241,0.25)',
          borderRadius:{topLeft:6,topRight:6,bottomLeft:0,bottomRight:0}, borderSkipped:false, stack:'total' },
        { type:'line', label:'Orçamento', data:m6.map(()=>budget),
          borderColor:'rgba(239,68,68,0.5)', borderDash:[5,4], borderWidth:1.5, pointRadius:0, tension:0, fill:false }
      ]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{grid:{display:false},stacked:true}, y:{grid:{color:'rgba(0,0,0,0.04)'},stacked:true,
        ticks:{callback:v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}} } }
  });

  // Category horizontal bar — all entries sorted desc
  if (catEntries.length) {
    chartInstances.top = new Chart(document.getElementById('c-top'), {
      type:'bar',
      data:{labels:catEntries.map(e=>e[0]),datasets:[{data:catEntries.map(e=>e[1]),backgroundColor:COLORS.cats,borderRadius:4,borderSkipped:false}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
        tooltip:{callbacks:{label:ctx=>` ${formatBRL(ctx.raw)}`}}},
        scales:{x:{grid:{display:false},ticks:{callback:v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}},y:{grid:{display:false}}}}
    });
  }

  // Per person
  const persons=['Felipe','Teresa','Casal'];
  chartInstances.person = new Chart(document.getElementById('c-person'), {
    type:'bar',
    data:{labels:persons,datasets:[{data:persons.map(p=>tx.filter(r=>r.person===p&&r.status!=='provisao').reduce((s,r)=>s+Number(r.amount),0)),
      backgroundColor:persons.map(p=>COLORS.persons[p]),borderRadius:6,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false}},y:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{callback:v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}}}}
  });
}
