import { showToast, exportCSV } from './utils.js';
import { getTx, getBudget, setBudget } from './db.js';
import { clearConfig } from './config.js';

const THEME_KEY = 'gastinhos_theme';

export async function initAjustes(supabase) {
  // theme
  const saved = localStorage.getItem(THEME_KEY) || 'auto';
  applyTheme(saved);
  document.querySelectorAll('.seg-btn[data-theme-val]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeVal === saved);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn[data-theme-val]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      localStorage.setItem(THEME_KEY, btn.dataset.themeVal);
      applyTheme(btn.dataset.themeVal);
    });
  });

  // email
  supabase.auth.getUser().then(({data}) => {
    const el = document.getElementById('ajustes-email');
    if (el && data?.user?.email) el.textContent = data.user.email;
  });

  // budget
  const budgetInput = document.getElementById('ajustes-budget');
  if (budgetInput) {
    const current = await getBudget();
    budgetInput.value = current;
    let saveTimer;
    budgetInput.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const val = parseFloat(budgetInput.value);
        if (val > 0) {
          await setBudget(val);
          showToast('Orçamento salvo');
        }
      }, 800);
    });
  }

  // logout
  document.getElementById('ajustes-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
  });

  // export all
  document.getElementById('ajustes-export').addEventListener('click', async () => {
    const all = await getTx();
    exportCSV(all, 'gastinhos-completo.csv');
    showToast('CSV exportado');
  });

  // reconfig
  document.getElementById('ajustes-reconfig').addEventListener('click', () => {
    clearConfig();
    location.reload();
  });
}

export function applyTheme(val) {
  const html = document.documentElement;
  if (val === 'auto') {
    html.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', val);
  }
}
