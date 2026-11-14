/* Mash'al Fund Manager — plain-JS SPA, artifact look (ngo-fund-management-app spec).
   Talks to POST /api/<action>. Brand tokens, Outfit, 240px sidebar >=1024px,
   mobile sticky header + 5-tab bottom nav, fund card, SVG bar/donut charts.
   Doodle theme toggle kept (user request). */
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const SESSION_KEY = 'mashal.session';
let session = null, me = null, members = [], orgName = "Mash'al Initiative";
let view = 'dashboard', selectedProject = null, hideAmounts = false, unread = 0;
let deferredPrompt = null;

try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { session = null; }
try { hideAmounts = localStorage.getItem('mashal.hide') === '1'; } catch (e) {}
function saveSession(s) { session = s; if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); }
function auth() { return session ? { memberId: session.memberId, token: session.token } : null; }
async function api(action, args = {}) {
  const res = await fetch('/api/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...args, auth: auth() }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('en-PK');
const rs = (n) => 'Rs ' + num(n);
const mask = (n) => hideAmounts ? 'Rs •••••' : rs(n);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return String(d || ''); } };
const fmtDateTime = (d) => { try { return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return String(d || ''); } };
function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (isNaN(s) || s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
const initials = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const avatar = (name, size) => `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(initials(name))}</span>`;
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

/* ---- icons: inline SVG, stroke 1.8, round caps (artifact lib) ---- */
const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
  down: '<path d="M12 4v16"/><path d="m6 14 6 6 6-6"/>',
  up: '<path d="M12 20V4"/><path d="m6 10 6-6 6 6"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z"/><path d="M5 19c3-5 7-9 11-11"/>',
  chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A16 16 0 0 0 2 12s3.5 7 10 7c1.5 0 2.8-.4 4-.9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  download: '<path d="M12 4v12"/><path d="m6 10 6 6 6-6"/><path d="M4 20h16"/>',
  printer: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  shield: '<path d="M12 3 5 6v5c0 5 3.5 8.5 7 10 3.5-1.5 7-5 7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M17.5 14.7c2.4.6 4 2.2 4 5.3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 13.5A8.5 8.5 0 0 1 10.5 4 8.5 8.5 0 1 0 20 13.5Z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
};
const ic = (name, size = 22) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;

/* ---- theme (doodle toggle kept) ---- */
function applyTheme() {
  const t = localStorage.getItem('mashal-theme') || 'system';
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const moon = '<svg viewBox="0 0 24 24" fill="none" stroke="#F0B446" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13.5A8.5 8.5 0 0 1 10.5 4 8.5 8.5 0 1 0 20 13.5Z" fill="#F0B446" stroke="#2F4A4A"/><path d="M18.5 3.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6Z" fill="#E08A5A" stroke="none"/></svg>';
  const sun = '<svg viewBox="0 0 24 24" fill="none" stroke="#F0B446" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="#F0B446" stroke="#2F4A4A"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"/></svg>';
  const half = '<svg viewBox="0 0 24 24" fill="none" stroke="#F0B446" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="#2F4A4A"/><path d="M12 3.5A8.5 8.5 0 0 1 12 20.5Z" fill="#F0B446" stroke="#2F4A4A"/></svg>';
  const btn = $('#themeBtn'); if (btn) btn.innerHTML = t === 'dark' ? sun : t === 'light' ? moon : half;
  document.querySelectorAll('[data-theme-pick]').forEach((b) => b.classList.toggle('on', b.dataset.themePick === t));
}
function cycleTheme() {
  const cur = localStorage.getItem('mashal-theme') || 'system';
  const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
  localStorage.setItem('mashal-theme', next); applyTheme();
}
function appearancePicker() {
  return `<div class="apick"><button type="button" data-theme-pick="light">${ic('sun', 17)} Light</button><button type="button" data-theme-pick="dark">${ic('moon', 17)} Dark</button><button type="button" data-theme-pick="system">${ic('monitor', 17)} System</button></div>`;
}
function bindApickers(root) {
  (root || document).querySelectorAll('[data-theme-pick]').forEach((b) => b.onclick = () => { localStorage.setItem('mashal-theme', b.dataset.themePick); applyTheme(); });
}
$('#themeBtn').onclick = cycleTheme;
applyTheme();

/* ---- PWA install ---- */
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.querySelectorAll('.installBtn').forEach((b) => b.classList.remove('hidden')); });
async function installApp() {
  if (!deferredPrompt) { alert('To install: open your browser menu and choose "Install app" or "Add to Home screen".'); return; }
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null;
}
const installSide = $('#installBtnSide'); if (installSide) installSide.onclick = installApp;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
function signOut() { saveSession(null); me = null; location.reload(); }

/* ---- shell: sidebar / mobile header / bottom nav ---- */
const NAV = [
  ['dashboard', 'Home', 'home'],
  ['funds', 'Funds', 'down'],
  ['projects', 'Drives', 'leaf'],
  ['analysis', 'Analysis', 'chart'],
  ['notifications', 'Notifications', 'bell'],
  ['profile', 'Profile', 'user'],
];
const BOTTOM = NAV.filter(([k]) => k !== 'notifications');
function go(v, arg) {
  if (v === 'project') { view = 'projects'; selectedProject = arg; }
  else { view = v; selectedProject = null; }
  window.scrollTo(0, 0);
  enterApp();
}
function renderShell() {
  const signedIn = !!me;
  $('#sidebar').hidden = !signedIn;
  $('#mheader').hidden = !signedIn;
  $('#bnav').hidden = !signedIn;
  if (!signedIn) return;
  $('#sideNav').innerHTML = NAV.map(([k, label, icon]) => `<button type="button" data-v="${k}" class="${view === k || (k === 'projects' && view === 'project') ? 'on' : ''}">${ic(icon, 22)} ${label}${k === 'notifications' && unread ? `<span class="nbadge">${unread}</span>` : ''}</button>`).join('');
  $('#sideNav').querySelectorAll('button').forEach((b) => b.onclick = () => go(b.dataset.v));
  $('#sideApick').innerHTML = appearancePicker();
  bindApickers($('#sideApick'));
  const sm = $('#sideMember');
  sm.hidden = false;
  sm.innerHTML = `${avatar(me.name, 38)}<div><b>${esc(me.name)}</b><span>${esc(me.role)}</span></div>`;
  $('#bnav').innerHTML = BOTTOM.map(([k, label, icon]) => `<button type="button" data-v="${k}" class="${view === k || (k === 'projects' && view === 'project') ? 'on' : ''}">${ic(icon, 22)} ${label}</button>`).join('');
  $('#bnav').querySelectorAll('button').forEach((b) => b.onclick = () => go(b.dataset.v));
  const bell = $('#bellBtn');
  bell.innerHTML = ic('bell', 20) + (unread ? `<span class="nbadge">${unread}</span>` : '');
  bell.onclick = () => go('notifications');
  applyTheme();
}
async function refreshUnread() {
  try { const n = await api('listNotifications', {}); unread = n.notifications.filter((x) => !x.is_read).length; } catch (e) { unread = 0; }
}

/* ---- login ---- */
let loginTab = 'signin', pickedMember = null, showPw = {};
function pwField(id, label, placeholder, autocomplete) {
  return `<label class="f">${label}</label><div class="pw-wrap"><input id="${id}" type="password" placeholder="${esc(placeholder)}" autocomplete="${autocomplete}"><button type="button" class="eye2" data-eye="${id}" aria-label="Show password">${ic('eye', 19)}</button></div>`;
}
function bindEyes(root) {
  (root || document).querySelectorAll('[data-eye]').forEach((b) => b.onclick = () => {
    const inp = document.getElementById(b.dataset.eye);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    b.innerHTML = ic(inp.type === 'password' ? 'eye' : 'eyeOff', 19);
  });
}
function loginShell(inner, footer) {
  return `<div class="login">
    <img class="logo" src="/logo.svg" alt="Mash'al Initiative logo">
    <h1>mash'al <span class="sep">|</span> مشعل</h1>
    <p class="subtitle">Mash'al Initiative · Fund Manager</p>
    <blockquote>“No one feels unseen. No one is left without support. And everyone has the opportunity to move forward.”</blockquote>
    <button class="btn ghost installBtn hidden" type="button" onclick="installApp()" style="margin-top:16px">Install the app</button>
    <div class="card">${inner}</div>
    <p class="foot">@mashal.initiative · To empower, uplift, and create change that lasts.</p>
  </div>`;
}
async function renderLogin() {
  renderShell();
  let data;
  try { data = await api('bootstrap', {}); } catch (e) {
    app.innerHTML = `<div class="card" style="max-width:448px;margin:48px auto"><h2>Couldn't load the app.</h2><p>${esc(e.message)}</p><p class="muted">If this is the Vercel deployment, check that DATABASE_URL is set in Vercel → Settings → Environment Variables, and that db/schema.sql was run in Supabase.</p><button class="btn ghost" onclick="location.reload()">Try again</button></div>`;
    return;
  }
  members = data.members || [];
  if (data.orgName) orgName = data.orgName;
  const approved = members.filter((m) => m.status === 'active');
  if (!members.length) {
    app.innerHTML = loginShell(`
      <h2 style="font-size:18px">Set up the team account</h2>
      <p class="muted" style="font-size:14px">Create the first account — it becomes the admin. The admin can then add the other members from Profile.</p>
      <div class="field"><label class="f">Your name</label><input id="suName" placeholder="e.g. Ayesha Khan" autocomplete="name"></div>
      ${pwField('suPw', 'Password', 'At least 8 characters', 'new-password')}
      ${pwField('suPw2', 'Confirm password', 'Type it again', 'new-password')}
      <p class="err" id="suErr"></p>
      <button class="btn primary block" id="suGo" style="margin-top:12px">Create admin account</button>`);
    bindEyes(app);
    $('#suGo').onclick = async () => {
      try {
        const r = await api('signup', { name: $('#suName').value, password: $('#suPw').value, confirmPassword: $('#suPw2').value });
        saveSession({ memberId: r.member.id, token: r.token }); me = r.member; await enterApp();
      } catch (e) { $('#suErr').textContent = e.message; }
    };
    return;
  }
  if (loginTab === 'signup') {
    app.innerHTML = loginShell(`
      <div class="tabs"><button type="button" id="tabIn">Sign in</button><button type="button" id="tabUp" class="on">Sign up</button></div>
      <h2 style="font-size:18px">Join the team</h2>
      <p class="muted" style="font-size:14px">Create your account here. It stays pending — you won't be able to sign in or see any funds until an admin activates it.</p>
      <div class="field"><label class="f">Your name</label><input id="suName" placeholder="Full name, as the team knows you" autocomplete="name"></div>
      ${pwField('suPw', 'Password', 'At least 8 characters, letter + number', 'new-password')}
      ${pwField('suPw2', 'Confirm password', 'Type it again', 'new-password')}
      <p class="helper">At least 8 characters, with a letter and a number. It's stored only as a secure hash — nobody, not even an admin, can read it back.</p>
      <p class="err" id="suErr"></p><p class="okmsg" id="suOk"></p>
      <button class="btn sage block" id="suGo" style="margin-top:12px">Sign up</button>`);
    bindEyes(app);
    $('#tabIn').onclick = () => { loginTab = 'signin'; renderLogin(); };
    $('#suGo').onclick = async () => {
      try {
        const r = await api('signup', { name: $('#suName').value, password: $('#suPw').value, confirmPassword: $('#suPw2').value });
        if (r.status === 'active') { saveSession({ memberId: r.member.id, token: r.token }); me = r.member; await enterApp(); return; }
        const nm = firstName($('#suName').value);
        app.innerHTML = loginShell(`
          <div style="text-align:center;padding:8px 0">
            <span class="success-leaf">${ic('leaf', 24)}</span>
            <h2 style="font-size:18px">You're signed up, ${esc(nm)} — almost there</h2>
            <p class="muted" style="font-size:14px">Your account is pending approval. Ask Hadia (admin) to activate your account — then come back and sign in with the password you just chose.</p>
            <button class="btn sage block" id="goIn" style="margin-top:12px">Go to Sign in</button>
            <p style="margin-top:12px"><button type="button" id="diffName" style="background:none;border:none;color:var(--accent-strong);font-weight:600">Sign up a different name</button></p>
          </div>`);
        $('#goIn').onclick = () => { loginTab = 'signin'; renderLogin(); };
        $('#diffName').onclick = () => renderLogin();
      } catch (e) { $('#suErr').textContent = e.message; }
    };
    return;
  }
  app.innerHTML = loginShell(`
    <div class="tabs"><button type="button" id="tabIn" class="on">Sign in</button><button type="button" id="tabUp">Sign up</button></div>
    <h2 style="font-size:18px">Welcome back</h2>
    <div class="field"><label class="f">Who's signing in?</label>
      <div class="picker">${approved.map((m) => `<button type="button" class="${pickedMember === m.id ? 'on' : ''}" data-id="${m.id}">${avatar(m.name, 32)}<span><b>${esc(m.name)}</b><span>${esc(m.role)}</span></span></button>`).join('')}</div>
    </div>
    ${pwField('siPw', 'Your password', 'Your password', 'current-password')}
    <p class="helper">Still on the old 4-digit PIN, or an admin gave you a temporary password? Sign in with that — you'll be asked to set your real password right away.</p>
    <p class="err" id="siErr"></p>
    <button class="btn sage block" id="siGo" style="margin-top:12px" ${pickedMember ? '' : 'disabled'}>Sign in</button>`);
  bindEyes(app);
  $('#tabUp').onclick = () => { loginTab = 'signup'; renderLogin(); };
  app.querySelectorAll('.picker button').forEach((c) => c.onclick = () => { pickedMember = c.dataset.id; renderLogin(); });
  const pw = $('#siPw');
  pw.addEventListener('input', () => { $('#siGo').disabled = !(pickedMember && pw.value); });
  $('#siGo').onclick = async () => {
    try {
      const r = await api('login', { memberId: pickedMember, password: pw.value });
      saveSession({ memberId: r.member.id, token: r.token }); me = r.member;
      if (r.needsSetup) { await renderSetupPassword(); return; }
      await enterApp();
    } catch (e) { $('#siErr').textContent = e.message; }
  };
}
async function renderSetupPassword() {
  app.innerHTML = `<div class="login">
    <img class="logo" src="/logo.svg" alt="Mash'al Initiative logo" style="width:112px;height:112px">
    <h1 style="font-size:24px">Set your password</h1>
    <p class="subtitle">Hi ${esc(firstName(me ? me.name : ''))} — Mash'al has moved from 4-digit PINs to passwords, so PINs can't be guessed or shared around. Choose yours now; your old PIN or temporary password stops working the moment you save.</p>
    <div class="card">
      ${pwField('pwCur', 'Current password', 'Old PIN or temporary password', 'current-password')}
      ${pwField('pwNew', 'New password', 'At least 8 characters, letter + number', 'new-password')}
      ${pwField('pwNew2', 'Confirm new password', 'Type it again', 'new-password')}
      <p class="helper">At least 8 characters, with a letter and a number. Don't reuse a password from another app.</p>
      <p class="err" id="pwErr"></p>
      <button class="btn sage block" id="pwGo" style="margin-top:12px">Save password &amp; continue</button>
      <p style="text-align:center;margin-top:12px"><button type="button" id="pwOut" style="background:none;border:none;color:var(--accent-strong);font-weight:600">Sign out instead</button></p>
    </div></div>`;
  bindEyes(app);
  $('#pwOut').onclick = () => signOut();
  $('#pwGo').onclick = async () => {
    try {
      await api('changeOwnPassword', { currentPassword: $('#pwCur').value, newPassword: $('#pwNew').value, confirmPassword: $('#pwNew2').value });
      saveSession(null); alert('Password set. Please sign in with your new password.'); await renderLogin();
    } catch (e) { $('#pwErr').textContent = e.message; }
  };
}

/* ---- app entry ---- */
async function enterApp() {
  try { const b = await api('bootstrap', {}); members = b.members || []; if (b.orgName) orgName = b.orgName; } catch (e) {}
  await refreshUnread();
  renderShell();
  if (view === 'dashboard') await renderDashboard();
  else if (view === 'funds') await renderFunds();
  else if (view === 'projects') await renderProjects();
  else if (view === 'project') await renderProjectDetail();
  else if (view === 'analysis') await renderAnalysis();
  else if (view === 'notifications') await renderNotifications();
  else await renderProfile();
}
function toggleHide() { hideAmounts = !hideAmounts; try { localStorage.setItem('mashal.hide', hideAmounts ? '1' : '0'); } catch (e) {} enterApp(); }
function txIcon(t) {
  return t.kind === 'donation'
    ? `<span class="iconcircle in">${ic('down', 18)}</span>`
    : `<span class="iconcircle out">${ic('up', 18)}</span>`;
}
function txTitle(t, projects) {
  if (t.note) return t.note;
  const p = (projects || []).find((x) => x.id === t.project_id);
  return p ? `${t.category} · ${p.name}` : t.category || (t.kind === 'donation' ? 'Donation' : 'Expense');
}
function activityPill(action) {
  const a = String(action || '').toLowerCase();
  if (a.includes('delet') || a.includes('remov')) return '<span class="pill deleted">deleted</span>';
  if (a.includes('edit') || a.includes('updat') || a.includes('status') || a.includes('password changed')) return '<span class="pill edited">edited</span>';
  return '<span class="pill added">added</span>';
}

/* ---- dashboard ---- */
function barChart(monthly) {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: d.toLocaleDateString('en-GB', { month: 'short' }) }); }
  const byKey = Object.fromEntries((monthly || []).map((m) => [m.month, m]));
  const data = months.map((m) => ({ label: m.label, in: num(byKey[m.key] ? byKey[m.key].in : 0) * 0 + (byKey[m.key] ? byKey[m.key].in : 0), out: byKey[m.key] ? byKey[m.key].out : 0 }));
  const max = Math.max(1, ...data.map((d) => Math.max(d.in, d.out)));
  const W = 600, H = 208, padL = 44, padB = 26, padT = 8, chartH = H - padT - padB, chartW = W - padL - 8;
  const fmtK = (v) => v >= 1000 ? (v / 1000) + 'k' : String(v);
  const grid = [0, .25, .5, .75, 1].map((f) => {
    const y = padT + chartH * (1 - f);
    return `<line x1="${padL}" y1="${y}" x2="${W - 8}" y2="${y}" stroke="var(--border)" stroke-dasharray="3 3"/><text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--dim)">${fmtK(Math.round(max * f))}</text>`;
  }).join('');
  const slot = chartW / 6, bw = 20;
  const bars = data.map((d, i) => {
    const cx = padL + slot * i + slot / 2;
    const hin = Math.max(d.in ? 3 : 0, (d.in / max) * chartH), hout = Math.max(d.out ? 3 : 0, (d.out / max) * chartH);
    return `<rect x="${cx - bw - 2}" y="${padT + chartH - hin}" width="${bw}" height="${hin}" rx="5" fill="#7A9B8A"><title>Received ${rs(d.in)}</title></rect><rect x="${cx + 2}" y="${padT + chartH - hout}" width="${bw}" height="${hout}" rx="5" fill="#E08A5A"><title>Spent ${rs(d.out)}</title></rect><text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="12" fill="var(--dim)">${d.label}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:208px" role="img" aria-label="Funds in vs spent, last 6 months">${grid}${bars}</svg>
  <div class="chart-legend"><span><i style="background:#7A9B8A"></i>Received</span><span><i style="background:#E08A5A"></i>Spent</span></div>`;
}
async function renderDashboard() {
  let d;
  try { d = await api('getDashboard', {}); } catch (e) { if (String(e.message).includes('sign in')) { saveSession(null); return renderLogin(); } app.innerHTML = `<div class="card"><p>${esc(e.message)}</p></div>`; return; }
  me = d.member;
  const open = (d.projects || []).filter((p) => p.status !== 'completed').length;
  const byCat = d.byCategory || [];
  const maxCat = Math.max(1, ...byCat.map((c) => c.value));
  let activity = [];
  try { activity = (await api('listActivity', {})).activity.slice(0, 6); } catch (e) {}
  app.innerHTML = `
  <div class="fundcard">
    <div class="row between"><span class="flabel">Total available funds</span><button class="eye" id="eyeBtn" type="button" title="Hide amounts" aria-label="Hide amounts">${ic(hideAmounts ? 'eyeOff' : 'eye', 20)}</button></div>
    <div class="famount">${hideAmounts ? 'Rs •••••' : '<span class="rs">Rs</span> ' + num(d.balance)}</div>
    <div class="fund-inner">
      <div class="mini"><span>${ic('down', 15)} Received</span><b>${mask(d.totalIn)}</b></div>
      <div class="mini"><span class="spent">${ic('up', 15)} Spent</span><b>${mask(d.totalOut + d.driveSpend)}</b></div>
    </div>
    <div class="row" style="margin-top:16px">
      <button class="btn sage" id="addFundsBtn">${ic('plus', 18)} Add funds</button>
      <button class="btn primary" id="addExpBtn">${ic('plus', 18)} Add expense</button>
      <button class="btn ghost" id="newDriveBtn">${ic('leaf', 18)} New drive</button>
    </div>
    ${open ? `<p class="fund-foot">${open} drive(s) in progress</p>` : ''}
  </div>
  <div class="card"><h2>Funds in vs spent</h2><p class="sub">Last 6 months</p>${barChart(d.monthly)}</div>
  ${byCat.length ? `<div class="card"><h2>Where the funds went</h2>
    ${byCat.map((c) => `<div class="bar-row"><div class="br-top"><span>${esc(c.name)}</span><b>${mask(c.value)}</b></div><div class="bar-track"><i style="width:${Math.max(4, Math.round(100 * c.value / maxCat))}%"></i></div></div>`).join('')}
  </div>` : ''}
  <div class="card"><div class="row between"><h2 style="margin:0">Latest money movement</h2><button type="button" class="linklike" id="viewAllBtn" style="background:none;border:none;color:var(--accent-strong);font-size:14px;font-weight:600">View all</button></div>
    ${(d.recent || []).length ? (d.recent || []).map((t) => `<div class="txrow">${txIcon(t)}<div class="tx-main"><b>${esc(txTitle(t, d.projects))}</b><span>${fmtDate(t.tx_date)} · by ${esc(t.member_name || '')}</span></div><span class="tx-amt ${t.kind === 'donation' ? 'in' : 'out'}">${t.kind === 'donation' ? '+' : '−'}${mask(t.amount)}</span></div>`).join('') : '<p class="muted">Nothing yet.</p>'}
  </div>
  <div class="card"><div class="row between"><h2 style="margin:0">Recent activity</h2><button type="button" id="auditBtn" style="background:none;border:none;color:var(--accent-strong);font-size:14px;font-weight:600">Audit trail</button></div>
    ${activity.length ? activity.map((a) => `<div class="actrow">${avatar(a.member_name, 34)}<div class="tx-main"><p><b>${esc(a.member_name)}</b> ${esc(a.detail || a.action)}</p><span>${timeAgo(a.created_at)}</span></div></div>`).join('') : '<p class="muted">Nothing yet. When a teammate adds funds, records an expense or starts a drive, it will show up here — with their name on it.</p>'}
  </div>`;
  $('#eyeBtn').onclick = toggleHide;
  $('#addFundsBtn').onclick = () => { fundsForm = { kind: 'donation' }; go('funds'); };
  $('#addExpBtn').onclick = () => { fundsForm = { kind: 'expense' }; go('funds'); };
  $('#newDriveBtn').onclick = () => go('projects');
  $('#viewAllBtn').onclick = () => go('funds');
  $('#auditBtn').onclick = () => go('analysis');
}

/* ---- funds ---- */
let fundsFilter = 'all', fundsForm = null, stmtDays = 30, stmtCustom = null;
async function renderFunds() {
  const [txs, projects] = [await api('listTransactions', {}), (await api('listProjects', {})).projects];
  const list = (txs.transactions || []).filter((t) => fundsFilter === 'all' || (fundsFilter === 'in' ? t.kind === 'donation' : t.kind === 'expense'));
  const formOpen = fundsForm;
  app.innerHTML = `
  <div class="row between"><h1>Funds &amp; expenses</h1><div class="row">
    <button class="btn sage" id="openAddFunds">${ic('down', 18)} Add funds</button>
    <button class="btn primary" id="openAddExp">${ic('up', 18)} Add expense</button>
  </div></div>
  ${formOpen ? `<div class="card" id="fundFormCard"></div>` : ''}
  <div class="card"><h2>All entries</h2>
    <div class="filterpills">
      <button type="button" data-f="all" class="${fundsFilter === 'all' ? 'on' : ''}">All</button>
      <button type="button" data-f="in" class="${fundsFilter === 'in' ? 'on' : ''}">Received</button>
      <button type="button" data-f="out" class="${fundsFilter === 'out' ? 'on' : ''}">Expenses</button>
    </div>
    ${list.length ? list.map((t) => `<div class="txrow">${txIcon(t)}<div class="tx-main"><b>${esc(txTitle(t, projects))}</b><span>${fmtDate(t.tx_date)} · by ${esc(t.member_name || '')}</span></div><span class="tx-amt ${t.kind === 'donation' ? 'in' : 'out'}">${t.kind === 'donation' ? '+' : '−'}${mask(t.amount)}</span><span style="display:flex;gap:4px;padding-left:12px"><button class="iconbtn" type="button" data-edit="${t.id}" title="Edit entry" aria-label="Edit entry">${ic('pencil', 13)}</button><button class="iconbtn" type="button" data-del="${t.id}" title="Delete entry" aria-label="Delete entry" style="color:var(--danger)">${ic('trash', 13)}</button></span></div>`).join('') : '<p class="muted">No entries yet. Add the first donation or expense above.</p>'}
  </div>
  <div class="card" id="stmtCard"><h2>Export statement</h2><p class="sub">A full account of every rupee in and out, with a running balance.</p><div id="stmtBody">Loading…</div></div>`;
  $('#openAddFunds').onclick = () => { fundsForm = { kind: 'donation' }; renderFunds(); };
  $('#openAddExp').onclick = () => { fundsForm = { kind: 'expense' }; renderFunds(); };
  app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { fundsFilter = b.dataset.f; renderFunds(); });
  if (formOpen) renderFundForm(formOpen, projects, txs.transactions || []);
  app.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => openDeleteTx(b.dataset.del, txs.transactions || []));
  app.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
    const t = (txs.transactions || []).find((x) => x.id === b.dataset.edit);
    if (t) { fundsForm = { kind: t.kind, edit: t }; renderFunds(); }
  });
  await renderStatement();
}
function renderFundForm(form, projects, allTxs) {
  const edit = form.edit;
  const isIn = form.kind === 'donation';
  const card = $('#fundFormCard');
  card.innerHTML = `
    <div class="row between"><h2 style="margin:0">${edit ? (isIn ? 'Edit fund entry' : 'Edit expense') : (isIn ? 'Add funds' : 'Add an expense')}</h2><button class="iconbtn" type="button" id="fundFormX" aria-label="Close">${ic('x', 18)}</button></div>
    <div class="formgrid" style="margin-top:12px">
      <div class="field"><label class="f">Amount (Rs)</label><input id="fAmt" type="number" min="1" step="1" placeholder="e.g. 5000" value="${edit ? esc(edit.amount) : ''}"></div>
      <div class="field"><label class="f">Date</label><input id="fDate" type="date" value="${edit ? esc(String(edit.tx_date).slice(0, 10)) : today()}"></div>
    </div>
    ${isIn
      ? `<div class="field"><label class="f">Received from (donor / source)</label><input id="fNote" placeholder="e.g. Monthly donor, Bake sale, Zakat collection" value="${edit ? esc(edit.note || '') : ''}"></div>`
      : `<div class="formgrid">
          <div class="field"><label class="f">Category</label><input id="fCat" list="catList" placeholder="e.g. Transport" value="${edit ? esc(edit.category || '') : ''}"><datalist id="catList"><option>Transport</option><option>Food &amp; Supplies</option><option>Printing &amp; Banners</option><option>Venue</option><option>Medical</option><option>Packaging</option><option>Other</option></datalist></div>
          <div class="field"><label class="f">For a drive (optional)</label><select id="fProj"><option value="">General expense</option>${projects.map((p) => `<option value="${esc(p.id)}" ${edit && edit.project_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label class="f">Note</label><input id="fNote" placeholder="e.g. Rickshaw to the shelter and back" value="${edit ? esc(edit.note || '') : ''}"></div>`}
    <p class="err" id="fErr"></p>
    <div class="row"><button class="btn ${isIn ? 'sage' : 'primary'}" id="fGo">${edit ? 'Save changes' : (isIn ? 'Save funds' : 'Save expense')}</button><button class="btn ghost" id="fCancel">Cancel</button></div>
    <p class="helper">Recorded as ${esc(me ? me.name : '')} — the whole team will see this in the activity log.</p>`;
  $('#fundFormX').onclick = () => { fundsForm = null; renderFunds(); };
  $('#fCancel').onclick = () => { fundsForm = null; renderFunds(); };
  $('#fGo').onclick = async () => {
    try {
      if (edit) {
        await api('updateTransaction', { id: edit.id, amount: Number($('#fAmt').value), note: $('#fNote').value, category: isIn ? (edit.category || 'General') : $('#fCat').value, date: $('#fDate').value });
      } else if (isIn) {
        await api('addTransaction', { kind: 'donation', amount: Number($('#fAmt').value), note: $('#fNote').value, category: 'Donation', date: $('#fDate').value });
      } else {
        await api('addTransaction', { kind: 'expense', amount: Number($('#fAmt').value), note: $('#fNote').value, category: $('#fCat').value || 'General', date: $('#fDate').value, projectId: $('#fProj').value || null });
      }
      fundsForm = null; await renderFunds();
    } catch (e) { $('#fErr').textContent = e.message; }
  };
}
function openDeleteTx(id, allTxs) {
  const t = allTxs.find((x) => x.id === id);
  if (!t) return;
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal"><h2>Delete this entry?</h2>
    <p>${t.kind === 'donation' ? 'Funds' : 'Expense'} of ${rs(t.amount)} from ${esc(t.note || t.category)} (${fmtDate(t.tx_date)}). The deletion is recorded in the audit trail with your name.</p>
    <div class="row"><button class="btn danger" id="mDel">Delete</button><button class="btn ghost" id="mKeep">Keep it</button></div></div>`;
  document.body.appendChild(back);
  back.querySelector('#mKeep').onclick = () => back.remove();
  back.onclick = (e) => { if (e.target === back) back.remove(); };
  back.querySelector('#mDel').onclick = async () => { await api('deleteTransaction', { id }); back.remove(); await renderFunds(); };
}
async function renderStatement() {
  const body = $('#stmtBody');
  if (!body) return;
  const presets = [[7, 'Last 7 days'], [15, 'Last 15 days'], [30, 'This month'], ['custom', 'Custom']];
  const daysFor = stmtCustom ? Math.max(1, Math.ceil((Date.now() - new Date(stmtCustom.from).getTime()) / 86400000) + 1) : (stmtDays === 30 ? new Date().getDate() : stmtDays);
  let s;
  try { s = await api('getStatement', { days: Math.min(365, daysFor) }); } catch (e) { body.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  let lines = s.lines || [];
  if (stmtCustom) {
    const before = lines.filter((l) => l.date < stmtCustom.from);
    const open = s.openingBalance + before.reduce((a, l) => a + (l.kind === 'donation' ? l.amount : -l.amount), 0);
    lines = lines.filter((l) => l.date >= stmtCustom.from && l.date <= stmtCustom.to).map((l) => ({ ...l, balance: open + l.balance - s.openingBalance }));
    s = { ...s, openingBalance: open, lines };
  }
  const received = lines.filter((l) => l.kind === 'donation').reduce((a, l) => a + l.amount, 0);
  const spent = lines.filter((l) => l.kind !== 'donation').reduce((a, l) => a + l.amount, 0);
  const closing = s.openingBalance + received - spent;
  body.innerHTML = `
    <div class="presetpills">${presets.map(([d, label]) => `<button type="button" data-preset="${d}" class="${(stmtCustom ? 'custom' : stmtDays) === d ? 'on' : ''}">${label}</button>`).join('')}</div>
    <div id="customRow" class="${stmtCustom ? '' : 'hidden'}"><div class="formgrid"><div class="field"><label class="f">From</label><input id="cFrom" type="date" value="${stmtCustom ? stmtCustom.from : today()}"></div><div class="field"><label class="f">To</label><input id="cTo" type="date" value="${stmtCustom ? stmtCustom.to : today()}"></div></div><button class="btn sage sm" id="cGo" type="button">Show statement</button></div>
    <div class="sumgrid">
      <div class="s-open"><span>Opening</span><b>${mask(s.openingBalance)}</b></div>
      <div class="s-in"><span>Received</span><b>+${mask(received)}</b></div>
      <div class="s-out"><span>Spent</span><b>−${mask(spent)}</b></div>
    </div>
    <p style="text-align:right;font-size:14px">Closing balance: <b>${mask(closing)}</b></p>
    <div class="tablewrap"><table><tr><th>Date</th><th>Description</th><th>In</th><th>Out</th><th>Balance</th></tr>
    ${lines.length ? lines.map((l) => `<tr><td>${fmtDate(l.date)}</td><td>${esc(l.note)}<br><span class="muted">by ${esc(l.member || '')}</span></td><td style="color:var(--accent-strong)">${l.kind === 'donation' ? mask(l.amount) : '—'}</td><td style="color:var(--flame-strong)">${l.kind !== 'donation' ? mask(l.amount) : '—'}</td><td>${mask(s.openingBalance + l.balance)}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">No entries in this period.</td></tr>'}
    </table></div>
    <div class="row" style="margin-top:12px"><button class="btn sage" id="csvBtn">${ic('download', 17)} Download CSV</button><button class="btn ghost" id="printBtn">${ic('printer', 17)} Print / save PDF</button></div>`;
  body.querySelectorAll('[data-preset]').forEach((b) => b.onclick = async () => {
    if (b.dataset.preset === 'custom') { stmtCustom = { from: today(), to: today() }; }
    else { stmtDays = Number(b.dataset.preset); stmtCustom = null; }
    await renderStatement();
  });
  const cGo = body.querySelector('#cGo');
  if (cGo) cGo.onclick = async () => { stmtCustom = { from: $('#cFrom').value, to: $('#cTo').value }; await renderStatement(); };
  body.querySelector('#csvBtn').onclick = () => {
    const csv = ['date,kind,amount,note,category,balance', ...lines.map((l) => [l.date, l.kind, l.amount, '"' + (l.note || '').replace(/"/g, '""') + '"', l.category, s.openingBalance + l.balance].join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'mashal-statement.csv'; a.click();
  };
  body.querySelector('#printBtn').onclick = () => window.print();
}

/* ---- drives ---- */
let newDriveKind = 'priced', newDriveOpen = false;
async function renderProjects() {
  const { projects } = await api('listProjects', {});
  app.innerHTML = `
  <div class="row between"><h1>Drives &amp; projects</h1><button class="btn primary" id="newDriveToggle">${newDriveOpen ? ic('x', 18) : ic('plus', 18)} ${newDriveOpen ? 'Close' : 'New drive'}</button></div>
  ${newDriveOpen ? `<div class="card" id="newDriveCard"></div>` : ''}
  ${(projects || []).length ? (projects || []).map((p) => {
    const spend = p.items.reduce((s, it) => s + Number(it.total || 0), 0);
    const given = (p.distributions || []).reduce((s, d) => s + (d.qty || 0), 0);
    const people = (p.distributions || []).reduce((s, d) => s + peopleReached(d), 0);
    return `<div class="card drive-row" data-open="${p.id}" role="button" tabindex="0">
      <span class="drive-ic ${p.kind === 'in-kind' ? 'inkind' : 'priced'}">${ic('leaf', 20)}</span>
      <div class="dmain"><div class="dname">${esc(p.name)}</div><div class="dsub">${fmtDate(p.created_at)} · ${p.kind === 'priced' ? 'Priced' : 'In-kind'} · ${p.status === 'completed' ? 'Completed' : 'In progress'}</div></div>
      <div style="text-align:right;font-size:14px">${p.kind === 'in-kind' ? `<b>${given} items given out</b><br><span class="muted">${people} people reached</span>` : `<b>Spent ${mask(spend)}</b><br><span class="muted">${p.items.length} items</span>`}</div>
      <span class="dot ${p.status === 'completed' ? 'done' : 'open'}"></span>
    </div>`;
  }).join('') : '<div class="card"><p class="muted">No drives yet. Start one above — a plant drive, a bird seed packet day, a cats food run — and cost it item by item.</p></div>'}
  <p class="muted">Example drives from Mash'al's own posts are marked as started by Mash'al Initiative — open one and add your real items to it.</p>`;
  $('#newDriveToggle').onclick = () => { newDriveOpen = !newDriveOpen; renderProjects(); };
  if (newDriveOpen) renderNewDrive();
  app.querySelectorAll('[data-open]').forEach((el) => {
    const open = () => go('project', el.dataset.open);
    el.onclick = open;
    el.onkeydown = (e) => { if (e.key === 'Enter') open(); };
  });
}
function peopleReached(d) {
  const m = String(d.recipient || '').match(/(\d+)\s*people/i);
  return m ? Number(m[1]) : (d.qty || 0);
}
function renderNewDrive() {
  const card = $('#newDriveCard');
  card.innerHTML = `
    <h2>Start a new drive</h2>
    <div class="field"><label class="f">Drive name</label><input id="pName" placeholder="e.g. Plant Drive, Cats Food, Winter Kits…"></div>
    <div class="typepick">
      <button type="button" id="pkPriced" class="${newDriveKind === 'priced' ? 'on-priced' : ''}"><b>Priced drive</b><span>You buy items — each item's qty × price deducts from the fund.</span></button>
      <button type="button" id="pkInkind" class="${newDriveKind === 'in-kind' ? 'on-inkind' : ''}"><b>In-kind drive</b><span>Donated goods like clothes — tracked by quantity given out, not price.</span></button>
    </div>
    <div class="formgrid">
      <div class="field"><label class="f">Drive date</label><input id="pDate" type="date" value="${today()}"></div>
      <div class="field"><label class="f">Note (optional)</label><input id="pDesc" placeholder="e.g. Model Town park"></div>
    </div>
    <p class="err" id="pErr"></p>
    <div class="row"><button class="btn primary" id="pGo">Start drive</button><button class="btn ghost" id="pCancel">Cancel</button></div>`;
  $('#pkPriced').onclick = () => { newDriveKind = 'priced'; renderProjects(); };
  $('#pkInkind').onclick = () => { newDriveKind = 'in-kind'; renderProjects(); };
  $('#pCancel').onclick = () => { newDriveOpen = false; renderProjects(); };
  $('#pGo').onclick = async () => {
    try {
      const note = $('#pDesc').value.trim();
      const date = $('#pDate').value;
      // The API stores only name/kind/description; a non-today drive date is
      // kept visible by prefixing it to the note (see final report).
      const desc = (date && date !== today() ? `Drive date: ${fmtDate(date)} — ` : '') + note;
      await api('createProject', { name: $('#pName').value, kind: newDriveKind, description: desc });
      newDriveOpen = false; await renderProjects();
    } catch (e) { $('#pErr').textContent = e.message; }
  };
}
async function renderProjectDetail() {
  const { project: p, items, distributions } = await api('getProject', { id: selectedProject });
  const spend = items.reduce((s, it) => s + Number(it.total || 0), 0);
  const given = distributions.reduce((s, d) => s + (d.qty || 0), 0);
  const people = distributions.reduce((s, d) => s + peopleReached(d), 0);
  const isAdmin = me && me.role === 'admin';
  let linked = [];
  try { linked = (await api('listTransactions', {})).transactions.filter((t) => t.project_id === p.id); } catch (e) {}
  app.innerHTML = `
  <button type="button" id="backBtn" style="background:none;border:none;color:var(--accent-strong);font-size:14px;font-weight:600;margin-bottom:12px;display:inline-flex;align-items:center;gap:2px">${ic('back', 18)} All drives</button>
  <div class="card">
    <h1>${esc(p.name)}</h1>
    <p class="sub" style="font-size:14px">${fmtDate(p.created_at)} · started by ${esc(orgName)}</p>
    ${p.description ? `<p style="font-size:14px">${esc(p.description)}</p>` : ''}
    <div class="row">
      <span class="pill ${p.kind === 'in-kind' ? 'blue' : 'flame'}">${p.kind === 'in-kind' ? 'In-kind' : 'Priced'}</span>
      <span class="pill ${p.status === 'completed' ? '' : 'grey'}">${p.status === 'completed' ? 'Completed' : 'In progress'}</span>
    </div>
    ${p.kind === 'priced'
      ? `<div class="sumgrid" style="grid-template-columns:1fr 1fr 1fr"><div class="s-open"><span>Items</span><b>${items.length}</b></div><div class="s-open"><span>Expenses</span><b>${mask(spend)}</b></div><div class="s-out"><span>Total spent</span><b>${mask(spend)}</b></div></div>`
      : `<div class="sumgrid" style="grid-template-columns:1fr 1fr"><div class="s-in" style="background:var(--blue-soft)"><span>Items given out</span><b>${given}</b></div><div class="s-in" style="background:var(--blue-soft)"><span>People reached</span><b>${people}</b></div></div>`}
    <div class="row">
      ${p.status === 'completed'
        ? `<button class="btn ghost" id="statusBtn">${ic('back', 18)} Reopen drive</button>`
        : `<button class="btn sage" id="statusBtn">${ic('check', 17)} Mark drive completed</button>`}
      ${isAdmin ? `<button class="btn danger" id="delProjBtn">${ic('trash', 16)} Delete drive</button>` : ''}
    </div>
  </div>
  ${p.kind === 'priced' ? `
  <div class="card"><h2>Items &amp; costing</h2><p class="sub">Every item deducts from the fund automatically — quantity × price per unit.</p>
    ${items.length ? `<div class="tablewrap"><table><tr><th>Item</th><th>Qty</th><th>Per unit</th><th>Total</th><th></th></tr>
    ${items.map((it) => `<tr><td>${esc(it.name)}</td><td>${it.qty}</td><td>${mask(it.unit_price)}</td><td>${mask(it.total)}</td><td><button class="iconbtn" type="button" data-delitem="${it.id}" style="color:var(--danger)" aria-label="Remove item">${ic('trash', 13)}</button></td></tr>`).join('')}
    <tr><td colspan="3"><b>Items total</b></td><td><b>${mask(spend)}</b></td><td></td></tr></table></div>`
    : '<p class="muted">No items yet. Add the first one — for example, Sunflower seeds, 1 kg × Rs 200.</p>'}
    <div id="addItemBox" style="margin-top:12px"><button class="btn sage" id="addItemToggle">${ic('plus', 18)} Add item</button></div>
  </div>` : `
  <div class="card"><h2>Hand-outs</h2>
    <p class="sub">Donated clothes don't have a set price, so this drive counts what matters instead: what was given out, its type and condition, and how many people received it. Any cash costs (like transport) can still be added as expenses below.</p>
    ${distributions.length ? distributions.map((d) => `<div class="txrow"><span class="iconcircle blue">${ic('leaf', 18)}</span><div class="tx-main"><b>${esc(d.item_type)} — ${d.qty} · to ${peopleReached(d)} people</b><span>${fmtDate(d.dist_date)} · by ${esc(d.member_name || '')}${d.proof ? ' · ' + esc(d.proof) : ''}</span></div><button class="iconbtn" type="button" data-deldist="${d.id}" style="color:var(--danger)" aria-label="Remove hand-out">${ic('trash', 13)}</button></div>`).join('') : '<p class="muted">No hand-outs recorded yet.</p>'}
    <div id="addDistBox" style="margin-top:12px"><button class="btn primary" id="addDistToggle">Record a hand-out</button></div>
  </div>`}
  <div class="card"><h2>Linked expenses</h2><p class="sub">Transport and other cash costs for this drive. Add new ones from the Funds page and pick this drive.</p>
    ${linked.length ? linked.map((t) => `<div class="txrow">${txIcon(t)}<div class="tx-main"><b>${esc(t.category)}${t.note ? ' — ' + esc(t.note) : ''}</b><span>${fmtDate(t.tx_date)} · by ${esc(t.member_name || '')}</span></div><span class="tx-amt out">−${mask(t.amount)}</span></div>`).join('') : '<p class="muted">No expenses linked yet.</p>'}
    <button class="btn ghost" id="addExpLink" style="margin-top:12px">${ic('plus', 18)} Add expense</button>
  </div>`;
  $('#backBtn').onclick = () => go('projects');
  $('#addExpLink').onclick = () => go('funds');
  $('#statusBtn').onclick = async () => { await api('setProjectStatus', { id: p.id, status: p.status === 'completed' ? 'open' : 'completed' }); await renderProjectDetail(); };
  const delP = $('#delProjBtn');
  if (delP) delP.onclick = () => {
    const back = document.createElement('div'); back.className = 'modal-back';
    back.innerHTML = `<div class="modal"><h2>Delete “${esc(p.name)}”?</h2><p>This removes the drive with all its items, linked expenses and hand-out records. Amounts return to the fund balance. This can't be undone.</p><div class="row"><button class="btn danger" id="mDel">Delete drive</button><button class="btn ghost" id="mKeep">Keep it</button></div></div>`;
    document.body.appendChild(back);
    back.querySelector('#mKeep').onclick = () => back.remove();
    back.onclick = (e) => { if (e.target === back) back.remove(); };
    back.querySelector('#mDel').onclick = async () => { await api('deleteProject', { id: p.id }); back.remove(); go('projects'); };
  };
  app.querySelectorAll('[data-delitem]').forEach((b) => b.onclick = async () => { await api('deleteProjectItem', { id: b.dataset.delitem }); await renderProjectDetail(); });
  app.querySelectorAll('[data-deldist]').forEach((b) => b.onclick = async () => { await api('deleteDistribution', { id: b.dataset.deldist }); await renderProjectDetail(); });
  const ait = $('#addItemToggle');
  if (ait) ait.onclick = () => {
    $('#addItemBox').innerHTML = `<div style="background:var(--surface-alt);border-radius:16px;padding:12px">
      <div class="field"><label class="f">Item name</label><input id="iName" placeholder="e.g. Sunflower seeds, Plastic bags, Mango sapling"></div>
      <div class="formgrid" style="grid-template-columns:1fr 1fr 1fr">
        <div class="field"><label class="f">Quantity</label><input id="iQty" type="number" min="1" placeholder="1"></div>
        <div class="field"><label class="f">Unit</label><input id="iUnit" list="unitList" value="kg"><datalist id="unitList"><option>kg</option><option>pcs</option><option>packets</option><option>bags</option><option>litres</option><option>boxes</option></datalist></div>
        <div class="field"><label class="f">Price per unit (Rs)</label><input id="iPrice" type="number" min="0" placeholder="200"></div>
      </div>
      <p class="sub" id="iTotal"></p>
      <div class="row"><button class="btn sage" id="iGo">Add item</button><button class="btn ghost" id="iCancel">Cancel</button></div>
      <p class="err" id="iErr"></p></div>`;
    const upd = () => { const q = Number($('#iQty').value) || 0, pr = Number($('#iPrice').value) || 0; $('#iTotal').textContent = q && pr >= 0 ? `Line total: ${rs(q * pr)} — deducts from the fund when saved.` : ''; };
    ['iQty', 'iPrice'].forEach((id) => $('#' + id).addEventListener('input', upd));
    $('#iCancel').onclick = () => renderProjectDetail();
    $('#iGo').onclick = async () => {
      try {
        const unit = $('#iUnit').value.trim();
        const name = $('#iName').value.trim() + (unit && unit !== 'kg' ? ` (${unit})` : '');
        await api('addProjectItem', { projectId: p.id, name, qty: Number($('#iQty').value), unitPrice: Number($('#iPrice').value) });
        await renderProjectDetail();
      } catch (e) { $('#iErr').textContent = e.message; }
    };
  };
  const adt = $('#addDistToggle');
  if (adt) adt.onclick = () => {
    $('#addDistBox').innerHTML = `<div style="background:var(--blue-soft);border-radius:16px;padding:12px">
      <div class="field"><label class="f">What was given out</label><input id="dWhat" placeholder="e.g. Winter jackets (good condition), Kids' shirts"></div>
      <div class="formgrid" style="grid-template-columns:1fr 1fr 1fr">
        <div class="field"><label class="f">Quantity</label><input id="dQty" type="number" min="1" placeholder="25"></div>
        <div class="field"><label class="f">Unit</label><input id="dUnit" list="unitList2" value="pcs"><datalist id="unitList2"><option>pcs</option><option>kg</option><option>packets</option><option>bags</option><option>boxes</option></datalist></div>
        <div class="field"><label class="f">People reached</label><input id="dPeople" type="number" min="0" placeholder="25"></div>
      </div>
      <div class="formgrid">
        <div class="field"><label class="f">Condition</label><input id="dCond" placeholder="e.g. Good"></div>
        <div class="field"><label class="f">Date</label><input id="dDate" type="date" value="${today()}"></div>
      </div>
      <div class="field"><label class="f">Note (optional)</label><input id="dNote" placeholder="e.g. Near the railway colony"></div>
      <div class="row"><button class="btn primary" id="dGo">Save hand-out</button><button class="btn ghost" id="dCancel">Cancel</button></div>
      <p class="err" id="dErr"></p></div>`;
    $('#dCancel').onclick = () => renderProjectDetail();
    $('#dGo').onclick = async () => {
      try {
        const unit = $('#dUnit').value.trim();
        const people = Number($('#dPeople').value) || 0;
        await api('addDistribution', {
          projectId: p.id,
          itemType: $('#dWhat').value.trim(),
          condition: [$('#dCond').value.trim(), unit && unit !== 'pcs' ? unit : ''].filter(Boolean).join(' · '),
          qty: Number($('#dQty').value),
          donor: '', recipient: people ? `${people} people` : '',
          proof: $('#dNote').value.trim(), date: $('#dDate').value,
        });
        await renderProjectDetail();
      } catch (e) { $('#dErr').textContent = e.message; }
    };
  };
}

/* ---- analysis ---- */
const DONUT_COLOURS = ['#7A9B8A', '#E08A5A', '#7FA8B8', '#C9A86A', '#A58BB5', '#8AA899', '#D4B06A'];
function donutSVG(data) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = 120, cy = 104, rO = 82, rI = 52;
  let a0 = -Math.PI / 2;
  const segs = data.map((d, i) => {
    const frac = d.value / total;
    const gap = 0.035;
    const a1 = a0 + frac * Math.PI * 2;
    const s0 = a0 + gap / 2, s1 = a1 - gap / 2;
    const large = (s1 - s0) > Math.PI ? 1 : 0;
    const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(rO, s0), [x1, y1] = p(rO, s1), [x2, y2] = p(rI, s1), [x3, y3] = p(rI, s0);
    a0 = a1;
    return `<path d="M ${x0} ${y0} A ${rO} ${rO} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rI} ${rI} 0 ${large} 0 ${x3} ${y3} Z" fill="${DONUT_COLOURS[i % DONUT_COLOURS.length]}"><title>${esc(d.name)} — ${rs(d.value)}</title></path>`;
  }).join('');
  return `<svg viewBox="0 0 240 208" style="width:100%;max-width:240px;height:208px;display:block;margin:0 auto" role="img" aria-label="Spending by category">${segs}<text x="120" y="100" text-anchor="middle" font-size="13" fill="var(--dim)">Total spent</text><text x="120" y="120" text-anchor="middle" font-size="16" font-weight="700" fill="var(--text)">${rs(total)}</text></svg>`;
}
async function renderAnalysis() {
  const a = await api('getAnalysis', {});
  const act = await api('listActivity', {});
  const d = await api('getDashboard', {});
  const completed = (d.projects || []).filter((p) => p.status === 'completed').length;
  const total = (d.projects || []).length;
  const inKindGiven = (a.byDrive || []).filter((x) => x.kind === 'in-kind').reduce((s, x) => s + (x.givenOut || 0), 0);
  const people = (d.projects || []).filter((p) => p.kind === 'in-kind').reduce((s, p) => s + (p.distributions || []).reduce((t, x) => t + peopleReached(x), 0), 0);
  const byDrive = a.byDrive || [];
  const maxDrive = Math.max(1, ...byDrive.map((x) => (x.kind === 'in-kind' ? x.givenOut : x.spend)));
  app.innerHTML = `
  <h1>Analysis</h1>
  <div class="kpi-grid">
    <div class="kpi"><span>Balance</span><b>${mask(d.balance)}</b><small>Received ${mask(d.totalIn)} · Spent ${mask(d.totalOut + d.driveSpend)}</small></div>
    <div class="kpi"><span>Drives</span><b>${completed}/${total}</b><small>completed of all drives</small></div>
    <div class="kpi"><span>In-kind items given</span><b>${inKindGiven}</b><small>clothes &amp; donated goods</small></div>
    <div class="kpi"><span>People reached</span><b>${people}</b><small>through in-kind hand-outs</small></div>
  </div>
  ${(a.byCategory || []).length ? `<div class="card"><h2>Spending by category</h2>${donutSVG(a.byCategory)}
    ${a.byCategory.map((c, i) => `<div class="row between" style="padding:4px 0"><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${DONUT_COLOURS[i % DONUT_COLOURS.length]};margin-right:6px"></i>${esc(c.name)}</span><b>${mask(c.value)}</b></div>`).join('')}
  </div>` : ''}
  <div class="card"><h2>Spending by drive</h2>
    ${byDrive.length ? byDrive.map((x) => `<div class="bar-row"><div class="br-top"><span>${esc(x.name)}</span><b>${x.kind === 'in-kind' ? x.givenOut + ' given out' : mask(x.spend)}</b></div><div class="bar-track"><i class="flame" style="width:${Math.max(4, Math.round(100 * (x.kind === 'in-kind' ? x.givenOut : x.spend) / maxDrive))}%"></i></div></div>`).join('') : '<p class="muted">No drives yet.</p>'}
  </div>
  <div class="card"><h2>Team contributions</h2>
    ${(a.byMember || []).length ? a.byMember.map((m) => `<div class="memberrow">${avatar(m.name, 36)}<div class="tx-main"><b>${esc(m.name)}</b><span>${(m.added || 0) + (m.spent || 0) ? '' : ''}${'recorded action(s)'}</span></div><span style="text-align:right;font-size:14px"><span style="color:var(--accent-strong);font-weight:700">added ${mask(m.added || 0)}</span><br><span style="color:var(--flame-strong);font-weight:700">spent ${mask(m.spent || 0)}</span></span></div>`).join('') : '<p class="muted">No entries yet.</p>'}
  </div>
  <div class="card"><h2>Audit trail</h2><p class="sub">Every fund change, edit and deletion — who did it, and when. Nothing is changed silently.</p>
    ${(act.activity || []).length ? (act.activity || []).map((x) => `<div class="actrow">${avatar(x.member_name, 34)}<div class="tx-main"><p><b>${esc(x.member_name)}</b> ${esc(x.detail || x.action)}</p><span>${timeAgo(x.created_at)} · ${fmtDateTime(x.created_at)}</span>${x.old_value ? `<br><span>Was: ${esc(x.old_value)}</span>` : ''}${x.new_value ? `<br><span>Now: ${esc(x.new_value)}</span>` : ''}</div>${activityPill(x.action)}</div>`).join('') : '<p class="muted">No activity yet.</p>'}
  </div>`;
}

/* ---- notifications ---- */
async function renderNotifications() {
  const { notifications } = await api('listNotifications', {});
  const list = notifications || [];
  const hasUnread = list.some((n) => !n.is_read);
  app.innerHTML = `
  <div class="row between"><h1>Notifications</h1>${hasUnread ? `<button class="btn ghost" id="markReadBtn">${ic('check', 15)} Mark all read</button>` : ''}</div>
  <div class="card">
    ${list.length ? list.map((n) => `<div class="notifrow ${n.is_read ? 'read' : ''}"><span class="ndot ${n.is_read ? 'read' : 'unread'}"></span><div style="flex:1"><p>${esc(n.message)}</p><span>${timeAgo(n.created_at)}</span></div>${n.is_read ? '' : '<span class="pill flame">New</span>'}</div>`).join('')
    : `<div class="empty"><div style="color:var(--dim);margin-bottom:8px">${ic('bell', 30)}</div>All quiet. When a teammate adds or edits funds, starts a drive or records an expense, you'll be told here.</div>`}
  </div>`;
  const mr = $('#markReadBtn');
  if (mr) mr.onclick = async () => { await api('markNotificationsRead', {}); unread = 0; await renderNotifications(); renderShell(); };
  if (hasUnread) {
    setTimeout(async () => {
      if (view !== 'notifications') return;
      try { await api('markNotificationsRead', {}); unread = 0; renderShell(); } catch (e) {}
    }, 2500);
  }
}

/* ---- profile ---- */
const ROLE_TEXT = {
  admin: 'admin · full administration',
  treasurer: 'treasurer · manages funds & all entries',
  member: 'member · manages own entries',
};
let editingMember = null, addingMember = false, editingOrg = false;
async function renderProfile() {
  const isAdmin = me && me.role === 'admin';
  const pending = members.filter((m) => m.status === 'pending');
  const active = members.filter((m) => m.status !== 'pending');
  let secLog = null, lockedNames = [];
  if (isAdmin) {
    try {
      secLog = await api('getSecurityLog', {});
      const recent = (secLog.attempts || []).filter((a) => !a.success && Date.now() - new Date(a.created_at).getTime() < 15 * 60 * 1000);
      const counts = {};
      recent.forEach((a) => { counts[a.member_name] = (counts[a.member_name] || 0) + 1; });
      lockedNames = Object.entries(counts).filter(([, c]) => c >= 5).map(([n]) => n);
    } catch (e) { secLog = { attempts: [] }; }
  }
  app.innerHTML = `
  <h1>Profile &amp; team</h1>
  <div class="card"><div class="orgcard"><img src="/logo.svg" alt="Mash'al logo"><div><b>mash'al | مشعل</b><span>${esc(orgName)}</span><small>@mashal.initiative</small></div></div></div>
  <div class="card"><div class="memberrow" style="border:none;padding:0">${avatar(me.name, 48)}<div class="tx-main"><b style="font-size:18px">${esc(me.name)}</b><span style="font-size:14px">${esc(ROLE_TEXT[me.role] || me.role)}</span></div><button class="btn ghost" id="signOutBtn">${ic('logout', 17)} Sign out</button></div>
    <div class="quote">“Our goal isn't just to give. It's to empower, uplift, and create change that lasts.”</div>
    <div style="margin-top:12px"><button class="btn sage installBtn hidden" type="button" onclick="installApp()">Install the app</button></div>
  </div>
  <div class="card"><h2>Appearance</h2><p class="sub">Choose light or dark mode, or follow your device's setting. Saved on this device.</p>${appearancePicker()}</div>
  <div class="card"><h2>${ic('shield', 20)} Security</h2>
    <p style="font-size:14px">Passwords replaced the old 4-digit PINs. Yours is stored only as a secure hash — nobody can read it, not even an admin. Five wrong tries lock an account for 15 minutes, and changing your password signs out every other device.</p>
    <h3 style="margin-top:12px">Change my password</h3>
    ${pwField('cpCur', 'Current password', 'Your current password', 'current-password')}
    <div class="formgrid" style="margin-top:12px">
      <div>${pwField('cpNew', 'New password', '8+ characters', 'new-password')}</div>
      <div>${pwField('cpNew2', 'Confirm new password', 'Type it again', 'new-password')}</div>
    </div>
    <p class="err" id="cpErr"></p><p class="okmsg" id="cpOk"></p>
    <button class="btn sage" id="cpGo" style="margin-top:12px">Change password</button>
    ${isAdmin ? `<h3 style="margin-top:20px">Sign-in activity (admin)</h3>
      ${lockedNames.length ? `<div class="lockbanner">Locked right now: ${esc(lockedNames.join(', '))} — too many wrong passwords. Locks clear on their own after 15 minutes.</div>` : ''}
      ${secLog ? ((secLog.attempts || []).filter((a) => !a.success).length
        ? `<p class="sub">${(secLog.attempts || []).filter((a) => !a.success).length} failed sign-in(s) in the recent log. Repeated failures on one name usually mean someone is guessing — tell the team and reset that password.</p>`
        : '<p class="sub">No failed sign-ins in the recent log.</p>')
      + ((secLog.attempts || []).slice(0, 15).map((a) => `<div class="memberrow"><span class="dot ${a.success ? 'done' : 'open'}" style="flex:none"></span><div class="tx-main"><b>${esc(a.member_name)} ${a.success ? 'signed in' : 'failed to sign in' + (a.reason ? ' — ' + esc(a.reason) : '')}</b><span>${timeAgo(a.created_at)}</span></div></div>`).join('') || '<p class="muted">No sign-in attempts logged yet.</p>') : ''}` : ''}
  </div>
  ${isAdmin ? `<div class="card" style="${pending.length ? 'border-color:var(--flame)' : ''}"><h2>${ic('users', 20)} Waiting for approval ${pending.length ? `<span class="pill flame">${pending.length}</span>` : ''}</h2>
    ${pending.length ? `<p class="sub" style="color:var(--flame-strong)">Waiting for approval — can't sign in yet</p>` + pending.map((m) => `<div class="memberrow">${avatar(m.name, 40)}<div class="tx-main"><b>${esc(m.name)}</b><span>signed up ${fmtDate(m.created_at)}</span></div><span><button class="btn sage sm" data-approve="${m.id}">Approve</button> <button class="btn danger sm" data-reject="${m.id}">Reject</button></span></div>`).join('') : '<p class="muted">Nobody is waiting.</p>'}
  </div>` : ''}
  <div class="card"><h2>${ic('users', 20)} Team (${members.length})</h2>
    <p class="sub">Everyone signs in with their own account and password, so every fund change carries a name. New teammates can also sign up themselves on the login page — their account stays pending until an admin approves it above.</p>
    ${isAdmin ? '<p class="sub">As admin you can add members, change roles, reset passwords and deactivate accounts.</p>' : ''}
    ${members.map((m) => `<div class="memberrow">${avatar(m.name, 40)}<div class="tx-main"><b>${esc(m.name)}${m.id === me.id ? ' (you)' : ''}</b><span>${esc(m.role)}${m.status !== 'active' ? ' · deactivated' : ''}</span></div>${isAdmin ? `<button class="btn ghost sm" data-editmember="${m.id}">Edit</button>` : ''}</div>
      ${editingMember === m.id ? `<div class="editbox" id="editBox"></div>` : ''}`).join('')}
    ${isAdmin ? `<div style="margin-top:16px"><button class="btn primary" id="addMemberToggle">${ic('plus', 18)} Add member</button></div>
    ${addingMember ? `<div class="editbox" id="addBox"></div>` : ''}` : ''}
  </div>
  ${isAdmin ? `<div class="card"><h2>Organisation settings</h2>
    <div class="field"><label class="f">Organisation name</label><input id="orgNameIn" value="${esc(orgName)}"></div>
    <p class="okmsg" id="orgOk"></p><p class="err" id="orgErr"></p>
    <button class="btn sage" id="orgGo">Save</button></div>` : ''}`;
  bindEyes(app);
  bindApickers(app);
  $('#signOutBtn').onclick = () => signOut();
  $('#cpGo').onclick = async () => {
    try {
      await api('changeOwnPassword', { currentPassword: $('#cpCur').value, newPassword: $('#cpNew').value, confirmPassword: $('#cpNew2').value });
      $('#cpOk').textContent = 'Password changed. Every other device has been signed out.';
      $('#cpErr').textContent = '';
      setTimeout(() => { saveSession(null); location.reload(); }, 1500);
    } catch (e) { $('#cpErr').textContent = e.message; }
  };
  if (isAdmin) {
    app.querySelectorAll('[data-approve]').forEach((b) => b.onclick = async () => { await api('updateMember', { memberId: b.dataset.approve, status: 'active' }); const bs = await api('bootstrap', {}); members = bs.members; await renderProfile(); });
    app.querySelectorAll('[data-reject]').forEach((b) => b.onclick = async () => {
      const back = document.createElement('div'); back.className = 'modal-back';
      back.innerHTML = `<div class="modal"><h2>Remove this sign-up?</h2><p>This removes the pending account. It can't be undone.</p><div class="row"><button class="btn danger" id="mDel">Remove</button><button class="btn ghost" id="mKeep">Keep</button></div></div>`;
      document.body.appendChild(back);
      back.querySelector('#mKeep').onclick = () => back.remove();
      back.onclick = (e) => { if (e.target === back) back.remove(); };
      back.querySelector('#mDel').onclick = async () => { await api('deleteMember', { memberId: b.dataset.reject }); back.remove(); const bs = await api('bootstrap', {}); members = bs.members; await renderProfile(); };
    });
    app.querySelectorAll('[data-editmember]').forEach((b) => b.onclick = () => { editingMember = b.dataset.editmember; addingMember = false; renderProfile(); });
    const amt = $('#addMemberToggle');
    if (amt) amt.onclick = () => { addingMember = !addingMember; editingMember = null; renderProfile(); };
    const orgGo = $('#orgGo');
    if (orgGo) orgGo.onclick = async () => {
      try { await api('updateSettings', { orgName: $('#orgNameIn').value }); orgName = $('#orgNameIn').value; $('#orgOk').textContent = 'Saved.'; $('#orgErr').textContent = ''; }
      catch (e) { $('#orgErr').textContent = e.message; }
    };
    if (editingMember) renderMemberEdit(editingMember);
    if (addingMember) renderMemberAdd();
  }
}
function renderMemberEdit(id) {
  const m = members.find((x) => x.id === id);
  const box = $('#editBox');
  if (!m || !box) return;
  const self = m.id === me.id;
  box.innerHTML = `
    <div class="formgrid">
      <div class="field"><label class="f">Name</label><input id="emName" value="${esc(m.name)}"></div>
      <div class="field"><label class="f">Role</label><select id="emRole">
        <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin — full control</option>
        <option value="treasurer" ${m.role === 'treasurer' ? 'selected' : ''}>Treasurer — funds &amp; edits</option>
        <option value="member" ${m.role === 'member' ? 'selected' : ''}>Member — own entries</option>
      </select></div>
    </div>
    ${self ? '<p class="helper">This is you — change your own password from “Change my password” above.</p>'
      : `<div class="field"><label class="f">Reset ${esc(firstName(m.name))}'s password (optional)</label><input id="emReset" type="password" placeholder="At least 8 characters, letter + number" autocomplete="new-password"></div>
      <p class="helper">Resetting signs ${esc(firstName(m.name))} out everywhere and makes them set a new password at their next sign-in. Share the temporary one privately, never in the group chat.</p>`}
    <p class="err" id="emErr"></p>
    <div class="row"><button class="btn sage" id="emGo">Save changes</button>
    ${self ? '' : `<button class="btn danger" id="emDeact">${m.status === 'active' ? 'Deactivate' : 'Reactivate'}</button>`}
    <button class="btn ghost" id="emCancel">Cancel</button></div>`;
  $('#emCancel').onclick = () => { editingMember = null; renderProfile(); };
  $('#emGo').onclick = async () => {
    try {
      const args = { memberId: m.id, name: $('#emName').value, role: $('#emRole').value };
      const rp = $('#emReset');
      if (rp && rp.value) args.resetPassword = rp.value;
      await api('updateMember', args);
      editingMember = null;
      const bs = await api('bootstrap', {}); members = bs.members; await renderProfile();
    } catch (e) { $('#emErr').textContent = e.message; }
  };
  const deact = $('#emDeact');
  if (deact) deact.onclick = async () => {
    await api('updateMember', { memberId: m.id, status: m.status === 'active' ? 'inactive' : 'active' });
    editingMember = null;
    const bs = await api('bootstrap', {}); members = bs.members; await renderProfile();
  };
}
function renderMemberAdd() {
  const box = $('#addBox');
  if (!box) return;
  box.innerHTML = `
    <div class="formgrid">
      <div class="field"><label class="f">Member name</label><input id="amName" placeholder="Full name"></div>
      <div class="field"><label class="f">Role</label><select id="amRole"><option value="member">Member — own entries</option><option value="treasurer">Treasurer — funds &amp; edits</option><option value="admin">Admin — full control</option></select></div>
    </div>
    <div class="field"><label class="f">Temporary password (they replace it at first sign-in)</label><input id="amPw" type="password" placeholder="At least 8 characters, letter + number" autocomplete="new-password"></div>
    <p class="helper">Give it to them privately. They'll be made to choose their own password the first time they sign in, and this one stops working.</p>
    <p class="err" id="amErr"></p>
    <div class="row"><button class="btn sage" id="amGo">Add member</button><button class="btn ghost" id="amCancel">Cancel</button></div>`;
  $('#amCancel').onclick = () => { addingMember = false; renderProfile(); };
  $('#amGo').onclick = async () => {
    try {
      await api('createMember', { name: $('#amName').value, role: $('#amRole').value, password: $('#amPw').value });
      addingMember = false;
      const bs = await api('bootstrap', {}); members = bs.members; await renderProfile();
    } catch (e) { $('#amErr').textContent = e.message; }
  };
}

/* ---- boot ---- */
(async () => {
  if (!session) { await renderLogin(); return; }
  try {
    const d = await api('getDashboard', {});
    me = d.member; await enterApp();
  } catch (e) { saveSession(null); await renderLogin(); }
})();
