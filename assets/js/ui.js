/** DOM helpers shared by every page: theme, toasts, modals, skeletons, forms. */
import { esc } from '../../utils/helpers.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------------------ theme */

const THEME_KEY = 'hms.theme';

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(saved ?? (prefersDark ? 'dark' : 'light'));
}

export function setTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem(THEME_KEY, mode);
  $$('[data-theme-icon]').forEach((el) => { el.textContent = mode === 'dark' ? '☾' : '☀'; });
}

export const toggleTheme = () =>
  setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');

/* ----------------------------------------------------------------- toasts */

export function toast(message, kind = 'info', ms = 4000) {
  let host = $('#toasts');
  if (!host) {
    host = Object.assign(document.createElement('div'), { id: 'toasts' });
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `<span>${esc(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, ms);
}

export const ok = (m) => toast(m, 'ok');
export const err = (m) => toast(m, 'err', 6000);

/* ----------------------------------------------------------------- modals */

/**
 * Promise-based confirm dialog. Resolves true on confirm, false on dismiss.
 * Focus is trapped to the dialog and Escape always cancels.
 */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="card rise" role="dialog" aria-modal="true" aria-labelledby="dlg-t"
           style="max-width:420px;width:100%;padding:1.25rem">
        <h3 id="dlg-t" class="display" style="font-size:19px;margin-bottom:.4rem">${esc(title)}</h3>
        <p style="font-size:13.5px;color:var(--text-mute);margin-bottom:1.1rem">${esc(body)}</p>
        <div style="display:flex;gap:.5rem;justify-content:flex-end">
          <button class="btn btn-ghost" data-act="cancel">Cancel</button>
          <button class="btn ${danger ? 'btn-seal' : 'btn-primary'}" data-act="ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    $('[data-act="ok"]', wrap).focus();

    const close = (value) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(value); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.dataset.act === 'cancel') close(false);
      if (e.target.dataset.act === 'ok') close(true);
    });
    document.addEventListener('keydown', onKey);
  });
}

/* -------------------------------------------------------------- skeletons */

export const skeletonRows = (rows = 6, cols = 5) =>
  Array.from({ length: rows }, () =>
    `<tr>${Array.from({ length: cols }, () =>
      '<td><div class="skeleton" style="height:12px"></div></td>').join('')}</tr>`).join('');

export function emptyState(title, body, actionHtml = '') {
  return `<div style="text-align:center;padding:3rem 1rem">
      <div class="eyebrow" style="margin-bottom:.6rem">Nothing here yet</div>
      <p class="display" style="font-size:18px;margin-bottom:.35rem">${esc(title)}</p>
      <p style="font-size:13px;color:var(--text-mute);max-width:38ch;margin:0 auto 1rem">${esc(body)}</p>
      ${actionHtml}
    </div>`;
}

/* ------------------------------------------------------------------ forms */

/** Reads a form into a plain object, trimming strings. */
export function readForm(form) {
  const data = {};
  for (const [k, v] of new FormData(form).entries()) {
    data[k] = typeof v === 'string' ? v.trim() : v;
  }
  return data;
}

/** Paints validation messages next to the fields they belong to. */
export function showErrors(form, errors) {
  $$('[data-error-for]', form).forEach((el) => { el.textContent = ''; });
  $$('[name]', form).forEach((el) => el.removeAttribute('aria-invalid'));

  for (const [field, message] of Object.entries(errors)) {
    const slot = $(`[data-error-for="${field}"]`, form);
    if (slot) slot.textContent = message;
    const input = $(`[name="${field}"]`, form);
    if (input) input.setAttribute('aria-invalid', 'true');
  }
  const first = $(`[name="${Object.keys(errors)[0]}"]`, form);
  first?.focus();
}

/** Disables a button and shows progress while an async action runs. */
export async function withBusy(button, label, fn) {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${label}`;
  try { return await fn(); }
  finally { button.disabled = false; button.innerHTML = original; }
}

/* ---------------------------------------------------------------- helpers */

export const icon = (path, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

export const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  school: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"/>',
  certificate: '<path d="M4 3h16v12H4z"/><path d="M9 19l3-2 3 2v-4H9z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.58.8.98 1.51 1H21a2 2 0 1 1 0 4h-.09c-.7.02-1.27.42-1.51 1z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  download: '<path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/>',
  print: '<path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/>'
};
