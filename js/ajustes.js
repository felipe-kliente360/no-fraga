import { showToast, exportCSV } from './utils.js';
import { getTx, getBudget, setBudget } from './db.js';

const THEME_KEY = 'gastinhos_theme';

export async function initAjustes(supabase) {
  // theme
  const saved = localStorage.getItem(THEME_KEY) || 'auto';
  applyTheme(saved);
  document.querySelectorAll('.seg-btn[data-theme-val]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeVal === saved);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn[data-theme-val]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      localStorage.setItem(THEME_KEY, btn.dataset.themeVal);
      applyTheme(btn.dataset.themeVal);
    });
  });

  // email
  supabase.auth.getUser().then(({ data }) => {
    const el = document.getElementById('ajustes-email');
    if (el && data?.user?.email) el.textContent = data.user.email;
  });

  // budget
  const budgetInput = document.getElementById('ajustes-budget');
  if (budgetInput) {
    const current = await getBudget();
    budgetInput.value = new Intl.NumberFormat('pt-BR').format(current);
    let saveTimer;
    budgetInput.addEventListener('focus', () => {
      const raw = parseFloat(budgetInput.value.replace(/\./g, '').replace(',', '.') || '0');
      budgetInput.value = raw > 0 ? String(Math.round(raw)) : '';
    });
    budgetInput.addEventListener('blur', () => {
      const val = parseFloat(budgetInput.value.replace(/\D/g, '') || '0');
      budgetInput.value = val > 0 ? new Intl.NumberFormat('pt-BR').format(val) : '';
    });
    budgetInput.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const val = parseFloat(budgetInput.value.replace(/\D/g, '') || '0');
        if (val > 0) { await setBudget(val); showToast('Orçamento salvo'); }
      }, 800);
    });
  }

  // accent color swatches
  const swatches = document.getElementById('ajustes-accent-swatches');
  if (swatches) {
    const savedColor = localStorage.getItem('gastinhos_accent') || '#6366F1';
    swatches.querySelectorAll('.color-swatch').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color.toLowerCase() === savedColor.toLowerCase());
      btn.addEventListener('click', () => {
        swatches.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyAccent(btn.dataset.color);
      });
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
}

export function applyTheme(val) {
  const html = document.documentElement;
  if (val === 'auto') {
    html.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', val);
  }
}

export function applyAccent(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-soft', `rgba(${r},${g},${b},0.12)`);
  document.documentElement.style.setProperty('--accent-fg', hex);
  localStorage.setItem('gastinhos_accent', hex);
}
