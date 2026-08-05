/**
 * Admin shell. Every admin page calls `mountAdmin()` first: it blocks render
 * until the session is confirmed, redirects unauthorised visitors, and paints
 * the sidebar and topbar around the page's own content.
 */
import { ready, logout, getProfile } from '../../services/authService.js';
import { getSettings } from '../../services/reportService.js';
import { isConfigured, APP } from '../../services/firebase.js';
import { $, initTheme, toggleTheme, icon, ICONS, err } from './ui.js';
import { esc, initials } from '../../utils/helpers.js';

const NAV = [
  { href: 'dashboard.html',    label: 'Dashboard',    icon: 'dashboard',   role: 'viewer' },
  { href: 'registration.html', label: 'Register',     icon: 'userPlus',    role: 'operator' },
  { href: 'students.html',     label: 'Students',     icon: 'users',       role: 'viewer' },
  { href: 'schools.html',      label: 'Schools',      icon: 'school',      role: 'operator' },
  { href: 'results.html',      label: 'Mark entry',   icon: 'clipboard',   role: 'operator' },
  { href: 'merit-list.html',   label: 'Merit list',   icon: 'award',       role: 'viewer' },
  { href: 'certificates.html', label: 'Certificates', icon: 'certificate', role: 'viewer' },
  { href: 'reports.html',      label: 'Reports',      icon: 'chart',       role: 'viewer' },
  { href: 'settings.html',     label: 'Settings',     icon: 'settings',    role: 'admin' },
  { href: 'admins.html',       label: 'Admins',       icon: 'shield',      role: 'super_admin' }
];

const rank = (role) => APP.roles[role]?.rank ?? 0;

/**
 * @param {Object} opts
 * @param {string} opts.page     filename of the current page, for nav highlighting
 * @param {string} opts.title    heading shown in the topbar
 * @param {string} opts.minRole  lowest role allowed to open this page
 * @returns {Promise<{profile, settings}>} resolved only for authorised users
 */
export async function mountAdmin({ page, title, minRole = 'viewer' }) {
  initTheme();

  if (!isConfigured()) {
    document.body.innerHTML = setupNotice();
    throw new Error('Firebase is not configured');
  }

  const { user, profile } = await ready();
  if (!user || !profile) {
    location.replace(`../login.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`);
    return new Promise(() => {});
  }
  if (rank(profile.role) < rank(minRole)) {
    document.body.innerHTML = deniedNotice(profile.role);
    throw new Error('Insufficient role');
  }

  const settings = await getSettings();
  paintShell({ page, title, profile, settings });
  document.body.classList.remove('opacity-0');
  return { profile, settings };
}

function paintShell({ page, title, profile, settings }) {
  const links = NAV.filter((n) => rank(profile.role) >= rank(n.role)).map((n) => `
    <a class="sidelink" href="${n.href}" ${n.href === page ? 'aria-current="page"' : ''}>
      ${icon(ICONS[n.icon])}<span>${n.label}</span>
    </a>`).join('');

  $('#sidebar').innerHTML = `
    <div style="padding:1.1rem 1rem .8rem">
      <div class="eyebrow">${esc(String(settings.examYear))} session</div>
      <div class="display" style="font-size:17px;line-height:1.25;margin-top:.25rem">
        ${esc(settings.examName)}
      </div>
    </div>
    <nav style="padding:0 .6rem;display:grid;gap:2px" aria-label="Admin sections">${links}</nav>
    <div style="margin-top:auto;padding:.8rem;border-top:1px solid var(--line)">
      <div style="display:flex;align-items:center;gap:.6rem">
        <div class="data" style="width:32px;height:32px;border-radius:50%;background:var(--seal-soft);
             color:var(--seal);display:grid;place-items:center;font-size:11px;font-weight:700">
          ${esc(initials(profile.name || profile.email))}
        </div>
        <div style="min-width:0;flex:1">
          <div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${esc(profile.name || profile.email)}
          </div>
          <div class="eyebrow">${esc(APP.roles[profile.role]?.label ?? profile.role)}</div>
        </div>
      </div>
      <button id="signout" class="btn btn-ghost btn-sm" style="width:100%;margin-top:.7rem">
        ${icon(ICONS.logout, 14)} Sign out
      </button>
    </div>`;

  $('#topbar-title').textContent = title;
  $('#signout').addEventListener('click', async () => {
    await logout();
    location.replace('../login.html');
  });
  $('#theme-toggle')?.addEventListener('click', toggleTheme);
  $('#menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

const setupNotice = () => `
  <div style="max-width:520px;margin:12vh auto;padding:2rem" class="card">
    <div class="eyebrow">Setup required</div>
    <h1 class="display" style="font-size:24px;margin:.4rem 0 .6rem">Connect a Firebase project</h1>
    <p style="font-size:14px;color:var(--text-mute);line-height:1.6">
      Open <code class="data">services/firebase.js</code> and replace the placeholder values in
      <code class="data">firebaseConfig</code> with the keys from your Firebase console
      (Project settings → Your apps → Web app). The README walks through the full setup.
    </p>
  </div>`;

const deniedNotice = (role) => `
  <div style="max-width:460px;margin:12vh auto;padding:2rem" class="card">
    <div class="eyebrow">Access denied</div>
    <h1 class="display" style="font-size:24px;margin:.4rem 0 .6rem">This page needs a higher role</h1>
    <p style="font-size:14px;color:var(--text-mute);line-height:1.6">
      You are signed in as <strong>${esc(APP.roles[role]?.label ?? role)}</strong>.
      Ask a super admin to change your role, or go back to the
      <a href="dashboard.html" style="color:var(--seal)">dashboard</a>.
    </p>
  </div>`;

/** Standard shell markup — admin pages include this via their own HTML. */
export const SHELL_NOTE = 'Include #sidebar, #topbar-title, #theme-toggle, #menu-toggle in the page.';
