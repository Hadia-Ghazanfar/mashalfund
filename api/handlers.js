// Mash'al Fund Manager — action handlers (shared by Vercel + local server).
// Every action takes (store, args) and returns a plain JSON object.
// Auth is passed as args.auth = { memberId, token } for signed-in actions.
import {
  ApiError, badRequest, unauthorized, forbidden, notFound,
  passwordProblem, hashPassword, verifyPassword, newToken, sessionExpiry,
  getActor, requireAdmin, notifyOthers, publicMember,
  LOCK_AFTER_FAILURES, LOCK_MINUTES,
} from './_lib.js';

const SEED_DRIVES = [
  { name: 'Gift a Tree', kind: 'priced', description: 'Share a Shade — free Jaman, Mango and Amrood saplings. 60+ saplings planted so far.' },
  { name: 'Share a Shade', kind: 'priced', description: 'Tree-planting drive: Jaman, Mango and Amrood saplings, given free.' },
  { name: 'Free Bird Seed Packets', kind: 'priced', description: 'Free bird seed packets: sunflower seeds, pearl millet (bajra), black chickpeas (kala chana).' },
  { name: 'Cats Food Drive', kind: 'priced', description: 'Food for cats in need.' },
  { name: 'Clothes Drive', kind: 'in-kind', description: 'Quantity-based drive: clothes counted by type and condition, with donor, recipient and proof. No price is fixed for clothes.' },
];

function money(n) { return Number(n) || 0; }

async function log(store, member, action, detail, oldV = null, newV = null) {
  await store.logActivity({ member_id: member ? member.id : null, member_name: member ? member.name : '', action, detail, old_value: oldV, new_value: newV });
}

async function issueSession(store, member) {
  const { token, tokenHash } = newToken();
  const session = await store.createSession(member.id, tokenHash, sessionExpiry());
  return { id: session.id, token, needsSetup: !!member.must_change_password };
}

// ---------- Auth ----------

async function bootstrap(store) {
  const members = (await store.listMembers()).map(publicMember);
  const orgName = (await store.getSetting('org_name')) || 'Mash\'al Initiative';
  return { members, orgName };
}

async function login(store, args) {
  const { memberId, password } = args;
  if (!memberId || !password) throw badRequest('Pick your name and enter your password.');
  const member = await store.getMember(memberId);
  if (!member) { await store.recordLoginAttempt(memberId, false, 'unknown member'); throw unauthorized('Wrong name or password.'); }

  const fails = await store.countRecentFailures(member.id, LOCK_MINUTES);
  if (fails >= LOCK_AFTER_FAILURES) {
    await store.recordLoginAttempt(member.id, false, 'locked');
    throw new ApiError(429, 'Too many wrong tries. This account is locked for 15 minutes.');
  }
  if (member.status === 'pending') {
    await store.recordLoginAttempt(member.id, false, 'pending');
    throw new ApiError(403, 'Your account is still waiting for approval. An admin will activate it soon.');
  }
  if (member.status !== 'active') {
    await store.recordLoginAttempt(member.id, false, 'inactive');
    throw unauthorized('This account is not active.');
  }

  // Legacy PIN / temporary password: account has no password hash yet.
  if (!member.password_hash) {
    if (member.legacy_pin_hash && verifyPassword(String(password), member.legacy_pin_hash.split(':')[0], member.legacy_pin_hash.split(':')[1])) {
      await store.recordLoginAttempt(member.id, true, 'legacy pin');
      const session = await issueSession(store, { ...member, must_change_password: true });
      await store.updateMember(member.id, { must_change_password: true });
      return { ...session, member: publicMember(member) };
    }
    await store.recordLoginAttempt(member.id, false, 'no password set');
    throw unauthorized('Wrong name or password.');
  }

  if (!verifyPassword(String(password), member.password_salt, member.password_hash)) {
    await store.recordLoginAttempt(member.id, false, 'wrong password');
    throw unauthorized('Wrong name or password.');
  }
  await store.recordLoginAttempt(member.id, true, null);
  const session = await issueSession(store, member);
  return { ...session, member: publicMember(member) };
}

async function signup(store, args) {
  const name = String(args.name || '').trim();
  const password = String(args.password || '');
  const confirm = String(args.confirmPassword || args.confirm || '');
  if (!name) throw badRequest('Please enter your name.');
  if (password !== confirm) throw badRequest('The two passwords do not match.');
  const problem = passwordProblem(password);
  if (problem) throw badRequest(problem);
  const existing = await store.findMemberByName(name);
  if (existing) throw badRequest('An account with this name already exists. Please sign in instead.');
  const members = await store.listMembers();
  const isFirst = members.length === 0;
  const { salt, hash } = hashPassword(password);
  const member = await store.createMember({
    name, role: isFirst ? 'admin' : 'member',
    status: isFirst ? 'active' : 'pending',
    password_hash: hash, password_salt: salt, must_change_password: false,
  });
  if (isFirst) {
    await log(store, member, 'account created', `${name} set up the team account as admin.`);
    const session = await issueSession(store, member);
    return { status: 'active', member: publicMember(member), ...session };
  }
  // Notify every active admin that a sign-up awaits approval.
  for (const m of members) {
    if (m.role === 'admin' && m.status === 'active') await store.createNotification(m.id, `${name} signed up and is waiting for approval.`);
  }
  await log(store, member, 'sign-up requested', `${name} signed up and is waiting for approval.`);
  return { status: 'pending', member: publicMember(member) };
}

async function logout(store, args) {
  const actor = await getActor(store, args.auth);
  await store.deleteSession(actor.session.id);
  return { ok: true };
}

async function changeOwnPassword(store, args) {
  const actor = await getActor(store, args.auth).catch(async () => {
    // Forced-setup path: the caller may have a session but must_change_password.
    // getActor already allows active members, so this catch is only for safety.
    throw unauthorized();
  });
  const { currentPassword, newPassword, confirmPassword } = args;
  const problem = passwordProblem(newPassword);
  if (problem) throw badRequest(problem);
  if (newPassword !== confirmPassword) throw badRequest('The two new passwords do not match.');
  const member = actor.member;
  const okCurrent = member.password_hash
    ? verifyPassword(String(currentPassword), member.password_salt, member.password_hash)
    : (member.legacy_pin_hash && verifyPassword(String(currentPassword), member.legacy_pin_hash.split(':')[0], member.legacy_pin_hash.split(':')[1]));
  if (!okCurrent) throw unauthorized('Your current password is wrong.');
  const { salt, hash } = hashPassword(newPassword);
  await store.updateMember(member.id, { password_hash: hash, password_salt: salt, legacy_pin_hash: null, must_change_password: false });
  await store.deleteSessionsForMember(member.id);
  await log(store, member, 'password changed', `${member.name} changed their password.`);
  return { ok: true, message: 'Password changed. Please sign in again on your other devices.' };
}

// ---------- Members (admin) ----------

async function createMember(store, args) {
  const actor = await requireAdmin(store, args.auth);
  const name = String(args.name || '').trim();
  const role = ['admin', 'treasurer', 'member'].includes(args.role) ? args.role : 'member';
  const password = String(args.password || '');
  if (!name) throw badRequest('Please enter a name.');
  const problem = passwordProblem(password);
  if (problem) throw badRequest(problem);
  if (await store.findMemberByName(name)) throw badRequest('An account with this name already exists.');
  const { salt, hash } = hashPassword(password);
  const member = await store.createMember({ name, role, status: 'active', password_hash: hash, password_salt: salt });
  await log(store, actor.member, 'member added', `${actor.member.name} added ${name} as ${role}.`);
  return { member: publicMember(member) };
}

async function updateMember(store, args) {
  const actor = await requireAdmin(store, args.auth);
  const target = await store.getMember(args.memberId);
  if (!target) throw notFound('Member not found.');
  const patch = {};
  if (args.name) patch.name = String(args.name).trim();
  if (args.role && ['admin', 'treasurer', 'member'].includes(args.role)) patch.role = args.role;
  if (args.status && ['pending', 'active', 'inactive'].includes(args.status)) patch.status = args.status;
  let resetNote = '';
  if (args.resetPassword) {
    const problem = passwordProblem(args.resetPassword);
    if (problem) throw badRequest(problem);
    const { salt, hash } = hashPassword(args.resetPassword);
    patch.password_hash = hash; patch.password_salt = salt; patch.legacy_pin_hash = null; patch.must_change_password = true;
    resetNote = ' Password reset — they must set a new password at next sign-in.';
    await store.deleteSessionsForMember(target.id);
  }
  const updated = await store.updateMember(target.id, patch);
  const wasPending = target.status === 'pending' && patch.status === 'active';
  await log(store, actor.member, wasPending ? 'sign-up approved' : 'member updated',
    `${actor.member.name} ${wasPending ? 'approved' : 'updated'} ${updated.name}.${resetNote}`);
  if (wasPending) await store.createNotification(updated.id, 'Your Mash\'al Fund Manager account was approved. You can sign in now.');
  return { member: publicMember(updated) };
}

async function deleteMember(store, args) {
  const actor = await requireAdmin(store, args.auth);
  const target = await store.getMember(args.memberId);
  if (!target) throw notFound('Member not found.');
  if (target.id === actor.member.id) throw badRequest('You cannot remove yourself.');
  const members = await store.listMembers();
  const activeAdmins = members.filter((m) => m.role === 'admin' && m.status === 'active' && m.id !== target.id);
  if (target.role === 'admin' && activeAdmins.length === 0) throw badRequest('You cannot remove the last active admin.');
  await store.deleteMember(target.id);
  await log(store, actor.member, 'member removed', `${actor.member.name} removed ${target.name} (${target.status}).`);
  return { ok: true };
}

// ---------- Funds ----------

async function getDashboard(store, args) {
  const actor = await getActor(store, args.auth);
  const txs = await store.listTransactions();
  const projects = await store.listProjects();
  const totalIn = txs.filter((t) => t.kind === 'donation').reduce((s, t) => s + money(t.amount), 0);
  const totalOut = txs.filter((t) => t.kind === 'expense').reduce((s, t) => s + money(t.amount), 0);
  const items = [];
  for (const p of projects) items.push(...(await store.listProjectItems(p.id)));
  const driveSpend = items.reduce((s, it) => s + money(it.total), 0);
  const balance = totalIn - totalOut - driveSpend;
  const monthly = {};
  for (const t of txs) {
    const m = String(t.tx_date).slice(0, 7);
    monthly[m] = monthly[m] || { month: m, in: 0, out: 0 };
    if (t.kind === 'donation') monthly[m].in += money(t.amount); else monthly[m].out += money(t.amount);
  }
  const byCategory = {};
  for (const t of txs.filter((x) => x.kind === 'expense')) byCategory[t.category] = (byCategory[t.category] || 0) + money(t.amount);
  return {
    member: publicMember(actor.member),
    balance, totalIn, totalOut, driveSpend,
    monthly: Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month)).slice(-12),
    byCategory: Object.entries(byCategory).map(([name, value]) => ({ name, value })),
    recent: txs.slice(0, 10),
    projects: await Promise.all(projects.map(async (p) => ({
      ...p, items: await store.listProjectItems(p.id),
      distributions: p.kind === 'in-kind' ? await store.listDistributions(p.id) : [],
    }))),
  };
}

async function addTransaction(store, args) {
  const actor = await getActor(store, args.auth);
  const kind = args.kind === 'expense' ? 'expense' : 'donation';
  const amount = money(args.amount);
  if (amount <= 0) throw badRequest('Amount must be more than 0.');
  const note = String(args.note || '').trim();
  const category = String(args.category || 'General').trim() || 'General';
  const tx = await store.createTransaction({
    kind, amount, note, category,
    project_id: args.projectId || null,
    member_id: actor.member.id, member_name: actor.member.name,
    tx_date: args.date || new Date().toISOString().slice(0, 10),
  });
  await log(store, actor.member, kind === 'donation' ? 'funds added' : 'expense added',
    `${actor.member.name} ${kind === 'donation' ? 'added' : 'spent'} Rs. ${amount.toLocaleString('en-PK')}${note ? ` — ${note}` : ''}.`,
    null, `Rs. ${amount}`);
  await notifyOthers(store, actor, `${actor.member.name} ${kind === 'donation' ? 'added Rs. ' + amount.toLocaleString('en-PK') + ' to the funds' : 'recorded an expense of Rs. ' + amount.toLocaleString('en-PK')}${note ? ` (${note})` : ''}.`);
  return { transaction: tx };
}

async function listTransactions(store, args) {
  await getActor(store, args.auth);
  return { transactions: await store.listTransactions() };
}

async function updateTransaction(store, args) {
  const actor = await getActor(store, args.auth);
  const tx = await store.getTransaction(args.id);
  if (!tx) throw notFound('Entry not found.');
  const patch = {};
  if (args.amount !== undefined) { if (money(args.amount) <= 0) throw badRequest('Amount must be more than 0.'); patch.amount = money(args.amount); }
  if (args.note !== undefined) patch.note = String(args.note);
  if (args.category !== undefined) patch.category = String(args.category);
  if (args.date !== undefined) patch.tx_date = args.date;
  const updated = await store.updateTransaction(tx.id, patch);
  await log(store, actor.member, 'entry edited', `${actor.member.name} edited a ${tx.kind} entry.`, `Rs. ${money(tx.amount)} — ${tx.note}`, `Rs. ${money(updated.amount)} — ${updated.note}`);
  await notifyOthers(store, actor, `${actor.member.name} edited a funds entry (${tx.kind}, Rs. ${money(tx.amount)}).`);
  return { transaction: updated };
}

async function deleteTransaction(store, args) {
  const actor = await getActor(store, args.auth);
  const tx = await store.getTransaction(args.id);
  if (!tx) throw notFound('Entry not found.');
  await store.deleteTransaction(tx.id);
  await log(store, actor.member, 'entry deleted', `${actor.member.name} deleted a ${tx.kind} entry of Rs. ${money(tx.amount)} (${tx.note}).`);
  await notifyOthers(store, actor, `${actor.member.name} deleted a funds entry (${tx.kind}, Rs. ${money(tx.amount)}).`);
  return { ok: true };
}

async function getStatement(store, args) {
  const actor = await getActor(store, args.auth);
  const days = Number(args.days) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const all = await store.listTransactions();
  const items = [];
  for (const p of await store.listProjects()) items.push(...(await store.listProjectItems(p.id)));
  const rows = [];
  for (const t of all) rows.push({ date: t.tx_date, kind: t.kind, amount: money(t.amount), note: t.note, category: t.category, member: t.member_name });
  for (const it of items) {
    const proj = (await store.listProjects()).find((p) => p.id === it.project_id);
    rows.push({ date: String(it.created_at).slice(0, 10), kind: 'expense', amount: money(it.total), note: `${it.name} × ${it.qty} — ${proj ? proj.name : 'drive'}`, category: 'Drive', member: '' });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const lines = rows.filter((r) => r.date >= since).map((r) => {
    running += r.kind === 'donation' ? r.amount : -r.amount;
    return { ...r, balance: running };
  });
  const opening = rows.filter((r) => r.date < since).reduce((s, r) => s + (r.kind === 'donation' ? r.amount : -r.amount), 0);
  return { days, openingBalance: opening, lines, member: publicMember(actor.member) };
}

// ---------- Projects / drives ----------

async function createProject(store, args) {
  const actor = await getActor(store, args.auth);
  const name = String(args.name || '').trim();
  if (!name) throw badRequest('Give the drive a name.');
  const kind = args.kind === 'in-kind' ? 'in-kind' : 'priced';
  const project = await store.createProject({ name, kind, description: String(args.description || '') });
  await log(store, actor.member, 'drive created', `${actor.member.name} created the drive "${name}".`);
  return { project };
}

async function listProjects(store, args) {
  await getActor(store, args.auth);
  const projects = await store.listProjects();
  return { projects: await Promise.all(projects.map(async (p) => ({
    ...p, items: await store.listProjectItems(p.id),
    distributions: p.kind === 'in-kind' ? await store.listDistributions(p.id) : [],
  }))) };
}

async function getProject(store, args) {
  await getActor(store, args.auth);
  const p = await store.getProject(args.id);
  if (!p) throw notFound('Drive not found.');
  return { project: p, items: await store.listProjectItems(p.id), distributions: await store.listDistributions(p.id) };
}

async function addProjectItem(store, args) {
  const actor = await getActor(store, args.auth);
  const project = await store.getProject(args.projectId);
  if (!project) throw notFound('Drive not found.');
  if (project.kind === 'in-kind') throw badRequest('This drive is quantity-based — add a distribution instead of a priced item.');
  const qty = money(args.qty) || 0;
  const unit = money(args.unitPrice);
  if (qty <= 0 || unit < 0) throw badRequest('Enter a quantity and a price.');
  const total = Math.round(qty * unit * 100) / 100;
  const item = await store.createProjectItem({ project_id: project.id, name: String(args.name || '').trim() || 'Item', qty, unit_price: unit, total });
  await log(store, actor.member, 'drive item added',
    `${actor.member.name} added "${item.name}" (${qty} × Rs. ${unit}) to "${project.name}" — Rs. ${total} deducted from the funds.`,
    null, `Rs. ${total}`);
  await notifyOthers(store, actor, `${actor.member.name} added "${item.name}" to "${project.name}" (Rs. ${total.toLocaleString('en-PK')}).`);
  return { item };
}

async function deleteProjectItem(store, args) {
  const actor = await getActor(store, args.auth);
  const item = await store.getProjectItem(args.id);
  if (!item) throw notFound('Item not found.');
  await store.deleteProjectItem(item.id);
  await log(store, actor.member, 'drive item removed', `${actor.member.name} removed "${item.name}" (Rs. ${money(item.total)}) — the amount returns to the funds.`);
  return { ok: true };
}

async function setProjectStatus(store, args) {
  const actor = await getActor(store, args.auth);
  const p = await store.getProject(args.id);
  if (!p) throw notFound('Drive not found.');
  const status = args.status === 'completed' ? 'completed' : 'open';
  const updated = await store.updateProject(p.id, { status });
  await log(store, actor.member, 'drive status', `${actor.member.name} marked "${p.name}" as ${status}.`);
  return { project: updated };
}

async function deleteProject(store, args) {
  const actor = await requireAdmin(store, args.auth);
  const p = await store.getProject(args.id);
  if (!p) throw notFound('Drive not found.');
  await store.deleteProject(p.id);
  await log(store, actor.member, 'drive deleted', `${actor.member.name} deleted the drive "${p.name}".`);
  return { ok: true };
}

async function addDistribution(store, args) {
  const actor = await getActor(store, args.auth);
  const project = await store.getProject(args.projectId);
  if (!project) throw notFound('Drive not found.');
  const qty = parseInt(args.qty, 10);
  if (!qty || qty <= 0) throw badRequest('Enter how many were given out.');
  const dist = await store.createDistribution({
    project_id: project.id,
    item_type: String(args.itemType || '').trim() || 'Item',
    condition: String(args.condition || ''),
    qty, donor: String(args.donor || ''), recipient: String(args.recipient || ''), proof: String(args.proof || ''),
    member_id: actor.member.id, member_name: actor.member.name,
    dist_date: args.date || new Date().toISOString().slice(0, 10),
  });
  await log(store, actor.member, 'in-kind given out', `${actor.member.name} gave out ${qty} × ${dist.item_type} from "${project.name}" to ${dist.recipient || 'a recipient'}.`);
  return { distribution: dist };
}

async function deleteDistribution(store, args) {
  const actor = await getActor(store, args.auth);
  await store.deleteDistribution(args.id);
  await log(store, actor.member, 'distribution removed', `${actor.member.name} removed a distribution record.`);
  return { ok: true };
}

// ---------- Analysis / audit / notifications ----------

async function getAnalysis(store, args) {
  await getActor(store, args.auth);
  const txs = await store.listTransactions();
  const projects = await store.listProjects();
  const byDrive = [];
  for (const p of projects) {
    const items = await store.listProjectItems(p.id);
    const spend = items.reduce((s, it) => s + money(it.total), 0);
    const dists = p.kind === 'in-kind' ? await store.listDistributions(p.id) : [];
    byDrive.push({ name: p.name, kind: p.kind, spend, items: items.length, givenOut: dists.reduce((s, d) => s + (d.qty || 0), 0) });
  }
  const byCategory = {};
  for (const t of txs.filter((x) => x.kind === 'expense')) byCategory[t.category] = (byCategory[t.category] || 0) + money(t.amount);
  const byMember = {};
  for (const t of txs) {
    const k = t.member_name || 'Unknown';
    byMember[k] = byMember[k] || { name: k, added: 0, spent: 0 };
    if (t.kind === 'donation') byMember[k].added += money(t.amount); else byMember[k].spent += money(t.amount);
  }
  return { byDrive, byCategory: Object.entries(byCategory).map(([name, value]) => ({ name, value })), byMember: Object.values(byMember) };
}

async function listActivity(store, args) {
  await getActor(store, args.auth);
  return { activity: await store.listActivity(200) };
}

async function listNotifications(store, args) {
  const actor = await getActor(store, args.auth);
  return { notifications: await store.listNotifications(actor.member.id) };
}

async function markNotificationsRead(store, args) {
  const actor = await getActor(store, args.auth);
  await store.markNotificationsRead(actor.member.id);
  return { ok: true };
}

async function getSecurityLog(store, args) {
  await requireAdmin(store, args.auth);
  const attempts = await store.listLoginAttempts(100);
  const members = await store.listMembers();
  const byId = Object.fromEntries(members.map((m) => [m.id, m.name]));
  return { attempts: attempts.map((a) => ({ ...a, member_name: byId[a.member_id] || 'Unknown' })) };
}

async function updateSettings(store, args) {
  const actor = await requireAdmin(store, args.auth);
  if (args.orgName) await store.setSetting('org_name', String(args.orgName).trim());
  return { ok: true };
}

async function seedExamples(store, args) {
  const actor = await requireAdmin(store, args.auth);
  const existing = new Set((await store.listProjects()).map((p) => p.name));
  let added = 0;
  for (const d of SEED_DRIVES) {
    if (!existing.has(d.name)) { await store.createProject(d); added++; }
  }
  await log(store, actor.member, 'seeded drives', `${actor.member.name} added the example drives (${added} new).`);
  return { added };
}

export const ACTIONS = {
  bootstrap, login, signup, logout, changeOwnPassword,
  createMember, updateMember, deleteMember,
  getDashboard, addTransaction, listTransactions, updateTransaction, deleteTransaction, getStatement,
  createProject, listProjects, getProject, addProjectItem, deleteProjectItem, setProjectStatus, deleteProject,
  addDistribution, deleteDistribution,
  getAnalysis, listActivity, listNotifications, markNotificationsRead, getSecurityLog,
  updateSettings, seedExamples,
};

export async function handleAction(store, action, args = {}) {
  const fn = ACTIONS[action];
  if (!fn) throw notFound(`Unknown action: ${action}`);
  try {
    return await fn(store, args);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.error('action error', action, e);
    throw new ApiError(500, 'Something went wrong. Please try again.');
  }
}
