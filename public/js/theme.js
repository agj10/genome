// ────────────────────────────────────
// Theme — 시스템 / 라이트 / 다크
// ────────────────────────────────────
const THEME_KEY = 'genome_theme';
const THEMES = ['system', 'light', 'dark'];
const THEME_ICONS = { system: '🖥️', light: '☀️', dark: '🌙' };

function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  // system → 미디어 쿼리
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  localStorage.setItem(THEME_KEY, pref);

  // 버튼 아이콘 업데이트
  document.querySelectorAll('.theme-toggle').forEach(el => {
    el.textContent = THEME_ICONS[pref];
  });
}

function cycleTheme() {
  const current = getStoredTheme();
  const idx = THEMES.indexOf(current);
  const next = THEMES[(idx + 1) % THEMES.length];
  applyTheme(next);
}

// 시스템 테마 변경 감지
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getStoredTheme() === 'system') applyTheme('system');
});

// 초기 적용
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(getStoredTheme());

  const btn = document.getElementById('theme-toggle');
  if (btn) btn.addEventListener('click', cycleTheme);

  const btn2 = document.getElementById('theme-toggle-menu');
  if (btn2) btn2.addEventListener('click', cycleTheme);
});
