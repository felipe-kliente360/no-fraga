import { getConfig, saveConfig, clearConfig } from './config.js';
import { initFCA } from './fca.js';
import { initDashboard, loadDashboard } from './dashboard.js';
import { initAnalise, loadAnalise, setAnalisePerson, getAnalisePerson } from './analise.js';
import { initHistorico, loadHistorico, setHistoricoPerson, getHistoricoPerson } from './historico.js';
import { initAjustes, applyTheme, applyAccent } from './ajustes.js';
import { init as initDb } from './db.js';

const { createClient } = window.supabase;

let sbClient;

// Apply saved theme immediately (before auth)
const savedTheme = localStorage.getItem('gastinhos_theme') || 'auto';
if (savedTheme === 'auto') {
  document.documentElement.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} else {
  document.documentElement.setAttribute('data-theme', savedTheme);
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (localStorage.getItem('gastinhos_theme') === 'auto') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});

// Apply saved accent color immediately
const savedAccent = localStorage.getItem('gastinhos_accent');
if (savedAccent) applyAccent(savedAccent);

function show(id) {
  ['screen-setup', 'screen-login', 'screen-app'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

async function start() {
  const config = getConfig();
  if (!config?.url || !config?.key) { setupScreen(); return; }
  sbClient = createClient(config.url, config.key);
  initDb(sbClient);
  const { data: { session } } = await sbClient.auth.getSession();
  if (!session) { loginScreen(); return; }
  appScreen();
}

function setupScreen() {
  show('screen-setup');
  document.getElementById('setup-submit').addEventListener('click', async () => {
    const url = document.getElementById('setup-url').value.trim();
    const key = document.getElementById('setup-key').value.trim();
    const err = document.getElementById('setup-error');
    if (!url || !key) { err.textContent = 'Preencha os dois campos'; err.classList.add('visible'); return; }
    saveConfig(url, key);
    sbClient = createClient(url, key);
    try {
      await sbClient.from('transactions').select('id').limit(1);
      initDb(sbClient);
      loginScreen();
    } catch (e) {
      err.textContent = 'Conexão falhou: ' + e.message;
      err.classList.add('visible');
      clearConfig();
    }
  });
}

function loginScreen() {
  show('screen-login');
  document.getElementById('login-submit').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const err = document.getElementById('login-error');
    const { error } = await sbClient.auth.signInWithPassword({ email, password: pass });
    if (error) { err.textContent = error.message; err.classList.add('visible'); return; }
    appScreen();
  });
}

async function appScreen() {
  show('screen-app');
  initDb(sbClient);
  sbClient.auth.getUser().then(({ data }) => {
    const email = (data?.user?.email || '').toLowerCase();
    const p = email.includes('teresa') ? 'Teresa' : email.includes('felipe') ? 'Felipe' : '';
    if (p) localStorage.setItem('gastinhos_default_person', p);
  });
  initFCA();
  initDashboard();
  initAnalise();
  initHistorico();
  await initAjustes(sbClient);
  setupTabs();
  lucide.createIcons();
  loadDashboard();

  window.addEventListener('gastinhos:tx-saved', () => {
    loadDashboard();
    const activeTab = document.querySelector('.tab-item.active')?.dataset.tab;
    if (activeTab === 'historico') loadHistorico();
    else if (activeTab === 'analise') loadAnalise();
  });
}

function buildPersonFilter(currentP, btnId, popoverId) {
  return `
    <button class="btn btn-ghost" id="${btnId}"><i data-lucide="users"></i></button>
    <div class="person-filter-popover" id="${popoverId}">
      ${['','Felipe','Teresa','Casal'].map(p =>
        `<div class="pf-option${p === currentP ? ' active' : ''}" data-p="${p}">${p || 'Todos'}</div>`
      ).join('')}
    </div>`;
}

function setupPersonPopover(popoverId, btnId, onChange) {
  const btn = document.getElementById(btnId);
  const pop = document.getElementById(popoverId);
  if (!btn || !pop) return;
  btn.onclick = e => { e.stopPropagation(); pop.classList.toggle('open'); };
  pop.querySelectorAll('.pf-option').forEach(el => {
    el.onclick = () => {
      onChange(el.dataset.p);
      pop.classList.remove('open');
      pop.querySelectorAll('.pf-option').forEach(x => x.classList.toggle('active', x.dataset.p === el.dataset.p));
    };
  });
  document.addEventListener('click', () => pop?.classList.remove('open'));
}

function setupTabs() {
  const titles = { dashboard: 'Dashboard', analise: 'Análise', historico: 'Histórico', ajustes: 'Ajustes' };

  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      document.getElementById(`tab-${tab}`).classList.add('active');
      document.getElementById('header-title').textContent = titles[tab];

      const ctrl = document.getElementById('header-controls');

      if (tab === 'dashboard') {
        initDashboard();
        lucide.createIcons();
        loadDashboard();
      } else if (tab === 'analise') {
        ctrl.innerHTML = buildPersonFilter(getAnalisePerson(), 'an-person-btn', 'an-person-popover');
        lucide.createIcons();
        setupPersonPopover('an-person-popover', 'an-person-btn', (p) => {
          setAnalisePerson(p);
          loadAnalise();
        });
        loadAnalise();
      } else if (tab === 'historico') {
        ctrl.innerHTML = `<button class="btn btn-ghost" id="hist-filter-toggle"><i data-lucide="sliders-horizontal"></i></button>` +
          buildPersonFilter(getHistoricoPerson(), 'hist-person-btn', 'hist-person-popover');
        lucide.createIcons();
        document.getElementById('hist-filter-toggle').addEventListener('click', () =>
          document.getElementById('hist-filter-bar').classList.toggle('open'));
        setupPersonPopover('hist-person-popover', 'hist-person-btn', (p) => {
          setHistoricoPerson(p);
          loadHistorico();
        });
        loadHistorico();
      } else {
        ctrl.innerHTML = '';
      }
    });
  });
}

start();
