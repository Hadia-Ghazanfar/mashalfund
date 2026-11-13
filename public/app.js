/* Mash'al Fund Manager — plain-JS SPA. Talks to POST /api/<action>. */
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app'), nav = $('#nav');
const SESSION_KEY = 'mashal.session';
let session = null, me = null, members = [], view = 'dashboard', hideAmounts = false;
let deferredPrompt = null;

try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { session = null; }
function saveSession(s) { session = s; if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); }
function auth() { return session ? { memberId: session.memberId, token: session.token } : null; }
async function api(action, args = {}) {
  const res = await fetch('/api/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...args, auth: auth() }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
const rs = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-PK');
const mask = (n) => hideAmounts ? 'Rs. ••••••' : rs(n);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);

/* ---- theme ---- */
function applyTheme() {
  const t = localStorage.getItem('mashal-theme') || 'system';
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  $('#themeBtn').textContent = t === 'dark' ? '☀️' : t === 'light' ? '🌙' : '🌓';
}
$('#themeBtn').onclick = () => {
  const cur = localStorage.getItem('mashal-theme') || 'system';
  const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
  localStorage.setItem('mashal-theme', next); applyTheme();
};
applyTheme();

/* ---- PWA install ---- */
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.querySelectorAll('.installBtn').forEach((b) => b.classList.remove('hidden')); $('#installBtnTop').classList.remove('hidden'); });
async function installApp() {
  if (!deferredPrompt) { alert('To install: open your browser menu and choose "Install app" or "Add to Home screen".'); return; }
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null;
}
$('#installBtnTop').onclick = installApp;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

/* ---- login ---- */
let loginTab = 'signin', pickedMember = null;
async function renderLogin() {
  nav.classList.add('hidden');
  let data;
  try { data = await api('bootstrap', {}); } catch (e) { app.innerHTML = `<div class="card"><h2>Could not reach the server</h2><p>${esc(e.message)}</p><p class="muted">If this is the Vercel deployment, check that DATABASE_URL is set in Vercel → Settings → Environment Variables, and that db/schema.sql was run in Supabase.</p></div>`; return; }
  members = data.members || [];
  const approved = members.filter((m) => m.status === 'active');
  app.innerHTML = `
  <div class="login">
    <img class="logo" src="/logo.svg" alt="Mash'al Initiative logo">
    <h1>mash'al | مشعل</h1>
    <p class="muted">Mash'al Initiative · Fund Manager</p>
    <blockquote>“No one feels unseen. No one is left without support. And everyone has the opportunity to move forward.”</blockquote>
    <button class="btn sage installBtn hidden" onclick="installApp()">⬇️ Install the app</button>
    <div class="tabs"><button id="tabIn" class="${loginTab === 'signin' ? 'on' : ''}">Sign in</button><button id="tabUp" class="${loginTab === 'signup' ? 'on' : ''}">Sign up</button></div>
    <div class="card" id="loginCard"></div>
    <p class="muted">@mashal.initiative · To empower, uplift, and create change that lasts.</p>
  </div>`;
  $('#tabIn').onclick = () => { loginTab = 'signin'; renderLogin(); };
  $('#tabUp').onclick = () => { loginTab = 'signup'; renderLogin(); };
  const card = $('#loginCard');
  if (loginTab === 'signup') {
    card.innerHTML = `
      <h2>Create your account</h2>
      <p class="muted">New accounts stay <b>pending</b> until an admin approves them. You cannot see any funds until then.</p>
      <label class="f">Your name</label><input id="suName" autocomplete="name">
      <label class="f">Password (8+ characters, a letter and a number)</label><input id="suPw" type="password" autocomplete="new-password">
      <label class="f">Confirm password</label><input id="suPw2" type="password" autocomplete="new-password">
      <p class="err" id="suErr"></p><p class="okmsg" id="suOk"></p>
      <button class="btn" id="suGo" style="width:100%">Sign up</button>`;
    $('#suGo').onclick = async () => {
      try {
        const r = await api('signup', { name: $('#suName').value, password: $('#suPw').value, confirmPassword: $('#suPw2').value });
        if (r.status === 'active') { saveSession({ memberId: r.member.id, token: r.token }); me = r.member; await enterApp(); }
        else { $('#suOk').textContent = 'Signed up! Your account is pending — an admin will approve it, then you can sign in.'; $('#suErr').textContent = ''; }
      } catch (e) { $('#suErr').textContent = e.message; }
    };
    return;
  }
  if (!approved.length) {
    card.innerHTML = `
      <h2>Set up the team account</h2>
      <p class="muted">No accounts exist yet. The first account becomes the admin.</p>
      <label class="f">Your name</label><input id="suName" autocomplete="name">
      <label class="f">Password (8+ characters, a letter and a number)</label><input id="suPw" type="password" autocomplete="new-password">
      <label class="f">Confirm password</label><input id="suPw2" type="password" autocomplete="new-password">
      <p class="err" id="suErr"></p>
      <button class="btn" id="suGo" style="width:100%">Create admin account</button>`;
    $('#suGo').onclick = async () => {
      try {
        const r = await api('signup', { name: $('#suName').value, password: $('#suPw').value, confirmPassword: $('#suPw2').value });
        saveSession({ memberId: r.member.id, token: r.token }); me = r.member; await enterApp();
      } catch (e) { $('#suErr').textContent = e.message; }
    };
    return;
  }
  card.innerHTML = `
    <h2>Welcome back</h2>
    <label class="f">Who's signing in?</label>
    <div>${approved.map((m) => `<button class="chip ${pickedMember === m.id ? 'on' : ''}" data-id="${m.id}">${esc(m.name)} · ${esc(m.role)}</button>`).join('')}</div>
    <label class="f">Your password</label><input id="siPw" type="password" autocomplete="current-password">
    <p class="muted">Still on the old 4-digit PIN, or an admin gave you a temporary password? Sign in with that — you'll be asked to set your real password right away.</p>
    <p class="err" id="siErr"></p>
    <button class="btn" id="siGo" style="width:100%" ${pickedMember ? '' : 'disabled'}>Sign in</button>`;
  card.querySelectorAll('.chip').forEach((c) => c.onclick = () => { pickedMember = c.dataset.id; renderLogin(); });
  $('#siGo').onclick = async () => {
    try {
      const r = await api('login', { memberId: pickedMember, password: $('#siPw').value });
      saveSession({ memberId: r.member.id, token: r.token }); me = r.member;
      if (r.needsSetup) { await renderSetupPassword(); return; }
      await enterApp();
    } catch (e) { $('#siErr').textContent = e.message; }
  };
}

async function renderSetupPassword() {
  app.innerHTML = `<div class="login"><div class="card">
    <h2>Set your password</h2>
    <p class="muted">Your old PIN / temporary password worked once. Now set a real password (8+ characters, a letter and a number). Your old PIN will stop working after this.</p>
    <label class="f">Old PIN / temporary password</label><input id="pwCur" type="password">
    <label class="f">New password</label><input id="pwNew" type="password">
    <label class="f">Confirm new password</label><input id="pwNew2" type="password">
    <p class="err" id="pwErr"></p>
    <button class="btn" id="pwGo" style="width:100%">Set password</button></div></div>`;
  $('#pwGo').onclick = async () => {
    try {
      await api('changeOwnPassword', { currentPassword: $('#pwCur').value, newPassword: $('#pwNew').value, confirmPassword: $('#pwNew2').value });
      saveSession(null); alert('Password set. Please sign in with your new password.'); await renderLogin();
    } catch (e) { $('#pwErr').textContent = e.message; }
  };
}

/* ---- app shell ---- */
const NAV = [['dashboard', '🏠 Dashboard'], ['funds', '💰 Funds'], ['projects', '🌱 Drives'], ['analysis', '📊 Analysis'], ['notifications', '🔔 Alerts'], ['profile', '👤 Profile']];
async function enterApp() {
  try { const b = await api('bootstrap', {}); members = b.members || []; } catch (e) { /* keep going */ }
  nav.classList.remove('hidden');
  nav.innerHTML = NAV.map(([k, label]) => `<button data-v="${k}" class="${view === k ? 'on' : ''}">${label}</button>`).join('');
  nav.querySelectorAll('button').forEach((b) => b.onclick = () => { view = b.dataset.v; enterApp(); });
  if (view === 'dashboard') await renderDashboard();
  else if (view === 'funds') await renderFunds();
  else if (view === 'projects') await renderProjects();
  else if (view === 'analysis') await renderAnalysis();
  else if (view === 'notifications') await renderNotifications();
  else await renderProfile();
}
function signOut() { saveSession(null); me = null; location.reload(); }
function navButtons() { return `<button class="btn ghost small" onclick="signOut()">Sign out</button>`; }

async function renderDashboard() {
  let d;
  try { d = await api('getDashboard', {}); } catch (e) { if (e.message.includes('sign in')) { saveSession(null); return renderLogin(); } app.innerHTML = `<div class="card"><p>${esc(e.message)}</p></div>`; return; }
  me = d.member;
  const unread = 0;
  app.innerHTML = `
  <h2>Assalam-o-Alaikum, ${esc(me.name)} 👋</h2>
  <p class="muted">Small acts. Meaningful change.</p>
  <div class="grid3">
    <div class="stat"><span>Total funds <button class="eye" id="eyeBtn" title="Hide amounts">${hideAmounts ? '🙈' : '👁️'}</button></span><b>${mask(d.balance)}</b></div>
    <div class="stat"><span>Money in</span><b>${mask(d.totalIn)}</b></div>
    <div class="stat"><span>Money out (incl. drives)</span><b>${mask(d.totalOut + d.driveSpend)}</b></div>
  </div>
  <div class="card"><h3>Spend by month</h3>
    ${d.monthly.length ? d.monthly.map((m) => `<div class="row" style="justify-content:space-between"><span>${esc(m.month)}</span><span>in ${mask(m.in)} · out ${mask(m.out)}</span></div><div class="bar"><i style="width:${m.in + m.out ? Math.round(100 * m.out / (m.in + m.out)) : 0}%"></i></div>`).join('') : '<p class="muted">No entries yet — add funds to get started.</p>'}
  </div>
  <div class="card"><h3>Recent activity</h3>
    ${d.recent.length ? `<table><tr><th>Date</th><th>What</th><th>Amount</th></tr>${d.recent.map((t) => `<tr><td>${esc(t.tx_date)}</td><td>${esc(t.note || t.category)} <span class="pill ${t.kind}">${t.kind}</span><br><span class="muted">${esc(t.member_name || '')}</span></td><td>${t.kind === 'donation' ? '+' : '−'} ${mask(t.amount)}</td></tr>`).join('')}</table>` : '<p class="muted">Nothing yet.</p>'}
  </div>
  <div class="card"><h3>Drives</h3>
    ${d.projects.map((p) => { const spend = p.items.reduce((s, it) => s + Number(it.total || 0), 0); return `<div class="row" style="justify-content:space-between"><span><b>${esc(p.name)}</b> <span class="pill">${esc(p.kind)}</span> <span class="muted">${esc(p.status)}</span></span><span>${p.kind === 'in-kind' ? (p.distributions || []).reduce((s, x) => s + (x.qty || 0), 0) + ' given out' : mask(spend) + ' spent'}</span></div>`; }).join('') || '<p class="muted">No drives yet.</p>'}
    ${me.role === 'admin' ? `<p><button class="btn ghost small" id="seedBtn">Add Mash'al example drives</button></p>` : ''}
  </div>`;
  $('#eyeBtn').onclick = () => { hideAmounts = !hideAmounts; renderDashboard(); };
  const seed = $('#seedBtn'); if (seed) seed.onclick = async () => { await api('seedExamples', {}); await renderDashboard(); };
}

async function renderFunds() {
  const [txs, stmt] = [await api('listTransactions', {}), await api('getStatement', { days: 30 })];
  app.innerHTML = `
  <h2>Add Funds &amp; Expenses</h2>
  <div class="card"><h3>New entry</h3>
    <div class="row"><select id="fKind"><option value="donation">Donation (money in)</option><option value="expense">Expense (money out)</option></select></div>
    <label class="f">Amount (Rs.)</label><input id="fAmt" type="number" min="1" step="1">
    <label class="f">Note</label><input id="fNote" placeholder="e.g. Donation from a supporter">
    <label class="f">Category</label><select id="fCat"><option>General</option><option>Donation</option><option>Transport</option><option>Food</option><option>Drive</option><option>Other</option></select>
    <label class="f">Date</label><input id="fDate" type="date" value="${today()}">
    <p class="err" id="fErr"></p><button class="btn" id="fGo">Save entry</button>
  </div>
  <div class="card"><h3>Statement — last 30 days</h3>
    <p class="muted">Opening balance: ${mask(stmt.openingBalance)}</p>
    <div class="row"><button class="btn ghost small" data-days="7">Weekly</button><button class="btn ghost small" data-days="15">15 days</button><button class="btn ghost small" data-days="30">Monthly</button><button class="btn sage small" id="csvBtn">⬇ Export CSV</button></div>
    <div class="tablewrap"><table><tr><th>Date</th><th>What</th><th>Amount</th><th>Balance</th></tr>
    ${stmt.lines.slice().reverse().map((l) => `<tr><td>${esc(l.date)}</td><td>${esc(l.note)} <span class="pill ${l.kind}">${l.kind}</span></td><td>${l.kind === 'donation' ? '+' : '−'} ${mask(l.amount)}</td><td>${mask(l.balance)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No entries in this period.</td></tr>'}
    </table></div></div>
  <div class="card"><h3>All entries</h3><div class="tablewrap"><table>
    ${txs.transactions.map((t) => `<tr><td>${esc(t.tx_date)}</td><td>${esc(t.note)}<br><span class="muted">${esc(t.category)} · ${esc(t.member_name || '')}</span></td><td>${t.kind === 'donation' ? '+' : '−'} ${mask(t.amount)}</td><td><button class="btn ghost small" data-del="${t.id}">Delete</button></td></tr>`).join('')}
  </table></div></div>`;
  $('#fGo').onclick = async () => {
    try { await api('addTransaction', { kind: $('#fKind').value, amount: Number($('#fAmt').value), note: $('#fNote').value, category: $('#fCat').value, date: $('#fDate').value }); await renderFunds(); }
    catch (e) { $('#fErr').textContent = e.message; }
  };
  app.querySelectorAll('[data-days]').forEach((b) => b.onclick = async () => {
    const s = await api('getStatement', { days: Number(b.dataset.days) });
    alert(`Statement — last ${b.dataset.days} days\nOpening: Rs. ${s.openingBalance}\nEntries: ${s.lines.length}\nClosing: Rs. ${s.lines.length ? s.lines[s.lines.length - 1].balance : s.openingBalance}`);
  });
  $('#csvBtn').onclick = async () => {
    const s = await api('getStatement', { days: 30 });
    const csv = ['date,kind,amount,note,category,balance', ...s.lines.map((l) => [l.date, l.kind, l.amount, '"' + (l.note || '').replace(/"/g, '""') + '"', l.category, l.balance].join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'mashal-statement-30-days.csv'; a.click();
  };
  app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Delete this entry?')) { await api('deleteTransaction', { id: b.dataset.del }); await renderFunds(); } });
}

async function renderProjects() {
  const { projects } = await api('listProjects', {});
  app.innerHTML = `
  <h2>Drives / Projects</h2>
  <div class="card"><h3>New drive</h3>
    <label class="f">Drive name (blank — write your own)</label><input id="pName" placeholder="e.g. Winter Drive">
    <label class="f">Type</label><select id="pKind"><option value="priced">Priced — item-wise costing, auto-deducted</option><option value="in-kind">In-kind — quantity-based, no price (e.g. clothes)</option></select>
    <label class="f">Description</label><input id="pDesc">
    <p class="err" id="pErr"></p><button class="btn" id="pGo">Create drive</button></div>
  ${projects.map((p) => {
    const spend = p.items.reduce((s, it) => s + Number(it.total || 0), 0);
    const given = (p.distributions || []).reduce((s, d) => s + (d.qty || 0), 0);
    return `<div class="card"><div class="row" style="justify-content:space-between"><h3>${esc(p.name)} <span class="pill">${esc(p.kind)}</span> <span class="pill">${esc(p.status)}</span></h3>
      <span>${p.kind === 'in-kind' ? given + ' items given out' : 'Spent: ' + mask(spend)}</span></div>
    <p class="muted">${esc(p.description || '')}</p>
    ${p.kind === 'priced' ? `<table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th></th></tr>
      ${p.items.map((it) => `<tr><td>${esc(it.name)}</td><td>${it.qty}</td><td>${mask(it.unit_price)}</td><td>${mask(it.total)}</td><td><button class="btn ghost small" data-delitem="${it.id}">✕</button></td></tr>`).join('')}
      </table>
      <label class="f">Add item — e.g. sunflower seeds, 1 kg, Rs. 200/kg</label>
      <div class="row"><input data-iname="${p.id}" placeholder="Item name" style="flex:2"><input data-iqty="${p.id}" type="number" placeholder="Qty" style="flex:1"><input data-iprice="${p.id}" type="number" placeholder="Price each" style="flex:1"><button class="btn small" data-additem="${p.id}">Add — deducts from funds</button></div>
      <p class="muted">Transport for this drive: add it as an Expense on the Funds page, category Transport.</p>`
    : `<table><tr><th>Type</th><th>Condition</th><th>Qty</th><th>Donor → Recipient</th><th>Proof</th><th></th></tr>
      ${(p.distributions || []).map((d) => `<tr><td>${esc(d.item_type)}</td><td>${esc(d.condition)}</td><td>${d.qty}</td><td>${esc(d.donor)} → ${esc(d.recipient)}</td><td>${esc(d.proof)}</td><td><button class="btn ghost small" data-deldist="${d.id}">✕</button></td></tr>`).join('')}
      </table>
      <label class="f">Record a hand-out</label>
      <div class="row"><input data-dtype="${p.id}" placeholder="Type e.g. Winter jacket" style="flex:2"><input data-dcond="${p.id}" placeholder="Condition e.g. Good" style="flex:1"><input data-dqty="${p.id}" type="number" placeholder="Qty" style="flex:1"></div>
      <div class="row"><input data-ddonor="${p.id}" placeholder="Donor"><input data-drec="${p.id}" placeholder="Recipient"><input data-dproof="${p.id}" placeholder="Proof (photo / note)"><button class="btn small" data-adddist="${p.id}">Record hand-out</button></div>`}
    <p><button class="btn ghost small" data-status="${p.id}">${p.status === 'open' ? 'Mark completed' : 'Reopen drive'}</button>
    ${me && me.role === 'admin' ? `<button class="btn danger small" data-delproj="${p.id}">Delete drive</button>` : ''}</p></div>`;
  }).join('') || '<p class="muted">No drives yet.</p>'}`;
  $('#pGo').onclick = async () => {
    try { await api('createProject', { name: $('#pName').value, kind: $('#pKind').value, description: $('#pDesc').value }); await renderProjects(); }
    catch (e) { $('#pErr').textContent = e.message; }
  };
  app.querySelectorAll('[data-additem]').forEach((b) => b.onclick = async () => {
    const pid = b.dataset.additem;
    try { await api('addProjectItem', { projectId: pid, name: $(`[data-iname="${pid}"]`).value, qty: Number($(`[data-iqty="${pid}"]`).value), unitPrice: Number($(`[data-iprice="${pid}"]`).value) }); await renderProjects(); }
    catch (e) { alert(e.message); }
  });
  app.querySelectorAll('[data-delitem]').forEach((b) => b.onclick = async () => { await api('deleteProjectItem', { id: b.dataset.delitem }); await renderProjects(); });
  app.querySelectorAll('[data-adddist]').forEach((b) => b.onclick = async () => {
    const pid = b.dataset.adddist;
    try { await api('addDistribution', { projectId: pid, itemType: $(`[data-dtype="${pid}"]`).value, condition: $(`[data-dcond="${pid}"]`).value, qty: Number($(`[data-dqty="${pid}"]`).value), donor: $(`[data-ddonor="${pid}"]`).value, recipient: $(`[data-drec="${pid}"]`).value, proof: $(`[data-dproof="${pid}"]`).value }); await renderProjects(); }
    catch (e) { alert(e.message); }
  });
  app.querySelectorAll('[data-deldist]').forEach((b) => b.onclick = async () => { await api('deleteDistribution', { id: b.dataset.deldist }); await renderProjects(); });
  app.querySelectorAll('[data-status]').forEach((b) => b.onclick = async () => {
    const p = projects.find((x) => x.id === b.dataset.status);
    await api('setProjectStatus', { id: p.id, status: p.status === 'open' ? 'completed' : 'open' }); await renderProjects();
  });
  app.querySelectorAll('[data-delproj]').forEach((b) => b.onclick = async () => { if (confirm('Delete this drive and all its items?')) { await api('deleteProject', { id: b.dataset.delproj }); await renderProjects(); } });
}

async function renderAnalysis() {
  const a = await api('getAnalysis', {});
  app.innerHTML = `<h2>Analysis</h2>
  <div class="card"><h3>Spend by drive</h3>
    ${a.byDrive.map((d) => `<div class="row" style="justify-content:space-between"><span>${esc(d.name)}</span><span>${d.kind === 'in-kind' ? d.givenOut + ' given out' : mask(d.spend)}</span></div>`).join('') || '<p class="muted">No drives yet.</p>'}</div>
  <div class="card"><h3>Spend by category</h3>
    ${a.byCategory.map((c) => `<div class="row" style="justify-content:space-between"><span>${esc(c.name)}</span><span>${mask(c.value)}</span></div>`).join('') || '<p class="muted">No expenses yet.</p>'}</div>
  <div class="card"><h3>Per member</h3>
    ${a.byMember.map((m) => `<div class="row" style="justify-content:space-between"><span>${esc(m.name)}</span><span>added ${mask(m.added)} · spent ${mask(m.spent)}</span></div>`).join('') || '<p class="muted">No entries yet.</p>'}</div>
  <div class="card"><h3>Audit trail — who changed what</h3><div id="audit">Loading…</div></div>`;
  const act = await api('listActivity', {});
  $('#audit').innerHTML = act.activity.length ? `<table>${act.activity.map((x) => `<tr><td>${new Date(x.created_at).toLocaleString()}</td><td><b>${esc(x.member_name)}</b> — ${esc(x.action)}<br><span class="muted">${esc(x.detail)}</span>${x.old_value ? `<br><span class="muted">Was: ${esc(x.old_value)}</span>` : ''}${x.new_value ? `<br><span class="muted">Now: ${esc(x.new_value)}</span>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">No activity yet.</p>';
}

async function renderNotifications() {
  const { notifications } = await api('listNotifications', {});
  app.innerHTML = `<h2>Notifications</h2><div class="card">
    ${notifications.length ? notifications.map((n) => `<p style="${n.is_read ? 'opacity:.6' : ''}">${esc(n.message)}<br><span class="muted">${new Date(n.created_at).toLocaleString()}</span></p>`).join('') : '<p class="muted">No notifications.</p>'}
    <button class="btn ghost small" id="markRead">Mark all as read</button></div>`;
  $('#markRead').onclick = async () => { await api('markNotificationsRead', {}); await renderNotifications(); };
}

async function renderProfile() {
  const isAdmin = me && me.role === 'admin';
  const pending = members.filter((m) => m.status === 'pending');
  const active = members.filter((m) => m.status !== 'pending');
  app.innerHTML = `<h2>Profile</h2>
  <div class="card"><h3>${esc(me.name)} · ${esc(me.role)}</h3>
    <p class="muted">Signed in as a Mash'al Initiative team member.</p>
    <button class="btn ghost small" onclick="signOut()">Sign out</button>
    <button class="btn sage small installBtn hidden" onclick="installApp()">⬇️ Install the app</button></div>
  <div class="card"><h3>Security</h3>
    <label class="f">Current password</label><input id="cpCur" type="password">
    <label class="f">New password (8+ chars, letter + number)</label><input id="cpNew" type="password">
    <label class="f">Confirm new password</label><input id="cpNew2" type="password">
    <p class="err" id="cpErr"></p><p class="okmsg" id="cpOk"></p>
    <button class="btn" id="cpGo">Change password</button>
    <p class="muted">Changing your password signs you out on your other devices.</p>
    ${isAdmin ? `<h3>Sign-in activity</h3><div id="secLog">Loading…</div>` : ''}</div>
  <div class="card"><h3>Appearance</h3>
    <div class="row"><button class="btn ghost small" data-theme-pick="light">Light</button><button class="btn ghost small" data-theme-pick="dark">Dark</button><button class="btn ghost small" data-theme-pick="system">System</button></div></div>
  ${isAdmin ? `<div class="card"><h3>Waiting for approval ${pending.length ? `<span class="pill pending">${pending.length}</span>` : ''}</h3>
    ${pending.length ? pending.map((m) => `<div class="row" style="justify-content:space-between"><span><b>${esc(m.name)}</b> <span class="muted">signed up ${new Date(m.created_at).toLocaleDateString()}</span></span><span><button class="btn sage small" data-approve="${m.id}">Approve</button> <button class="btn danger small" data-reject="${m.id}">Reject</button></span></div>`).join('') : '<p class="muted">Nobody is waiting.</p>'}
    <h3>Team members</h3>
    ${active.map((m) => `<div class="row" style="justify-content:space-between"><span><b>${esc(m.name)}</b> · ${esc(m.role)} <span class="pill">${esc(m.status)}</span></span><span>${m.id !== me.id ? `<button class="btn ghost small" data-deactivate="${m.id}">${m.status === 'active' ? 'Deactivate' : 'Activate'}</button> <button class="btn danger small" data-del="${m.id}">Remove</button>` : ''}</span></div>`).join('')}
    <h3>Add a member directly</h3>
    <label class="f">Name</label><input id="amName"><label class="f">Role</label><select id="amRole"><option value="member">Member</option><option value="treasurer">Treasurer</option><option value="admin">Admin</option></select>
    <label class="f">Password (8+ chars, letter + number)</label><input id="amPw" type="password">
    <p class="err" id="amErr"></p><button class="btn" id="amGo">Add member</button></div>` : ''}`;
  $('#cpGo').onclick = async () => {
    try { await api('changeOwnPassword', { currentPassword: $('#cpCur').value, newPassword: $('#cpNew').value, confirmPassword: $('#cpNew2').value }); saveSession(null); alert('Password changed. Please sign in again.'); location.reload(); }
    catch (e) { $('#cpErr').textContent = e.message; }
  };
  app.querySelectorAll('[data-theme-pick]').forEach((b) => b.onclick = () => { localStorage.setItem('mashal-theme', b.dataset.themePick); applyTheme(); });
  if (isAdmin) {
    try { const s = await api('getSecurityLog', {}); $('#secLog').innerHTML = s.attempts.length ? `<table>${s.attempts.slice(0, 20).map((a) => `<tr><td>${new Date(a.created_at).toLocaleString()}</td><td>${esc(a.member_name)}</td><td>${a.success ? '✅ Success' : '❌ Failed' + (a.reason ? ' (' + esc(a.reason) + ')' : '')}</td></tr>`).join('')}</table>` : '<p class="muted">No sign-in attempts logged yet.</p>'; } catch (e) { $('#secLog').innerHTML = '<p class="muted">Could not load the log.</p>'; }
    app.querySelectorAll('[data-approve]').forEach((b) => b.onclick = async () => { await api('updateMember', { memberId: b.dataset.approve, status: 'active' }); const bs = await api('bootstrap', {}); members = bs.members; await renderProfile(); });
    app.querySelectorAll('[data-reject]').forEach((b) => b.onclick = async () => { if (confirm('Reject and remove this sign-up?')) { await api('deleteMember', { memberId: b.dataset.reject }); const bs = await api('bootstrap', {}); members = bs.members; await renderProfile(); } });
    app.querySelectorAll('[data-deactivate]').forEach((b) => b.onclick = async () => { const m = members.find((x) => x.id === b.dataset.deactivate); await api('updateMember', { memberId: m.id, status: m.status === 'active' ? 'inactive' : 'active' }); const bs = await api('bootstrap', {}); members = bs.members; await renderProfile(); });
    app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Remove this member permanently?')) { await api('deleteMember', { memberId: b.dataset.del }); const bs = await api('bootstrap', {}); members = bs.members; await renderProfile(); } });
    $('#amGo').onclick = async () => {
      try { await api('createMember', { name: $('#amName').value, role: $('#amRole').value, password: $('#amPw').value }); const bs = await api('bootstrap', {}); members = bs.members; await renderProfile(); }
      catch (e) { $('#amErr').textContent = e.message; }
    };
  }
}

/* ---- boot ---- */
(async () => {
  if (!session) { await renderLogin(); return; }
  try {
    const d = await api('getDashboard', {});
    me = d.member; await enterApp();
  } catch (e) { saveSession(null); await renderLogin(); }
})();
