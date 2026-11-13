// In-memory store — used ONLY for local development / tests when no
// DATABASE_URL is set. Vercel (production) always uses the Postgres store
// (api/_store-pg.js). Data here lives only in the running process.
import crypto from 'node:crypto';

function id() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

export function createMemoryStore() {
  const members = [];
  const sessions = [];
  const attempts = [];
  const settings = new Map();
  const transactions = [];
  const projects = [];
  const items = [];
  const distributions = [];
  const activity = [];
  const notifications = [];

  return {
    kind: 'memory',
    async listMembers() { return [...members].sort((a, b) => a.created_at.localeCompare(b.created_at)); },
    async getMember(mid) { return members.find((m) => m.id === mid) || null; },
    async findMemberByName(name) {
      return members.find((m) => m.name.trim().toLowerCase() === String(name).trim().toLowerCase()) || null;
    },
    async createMember(data) {
      const m = { id: id(), created_at: now(), status: 'active', role: 'member', password_hash: null, password_salt: null, legacy_pin_hash: null, must_change_password: false, ...data };
      members.push(m);
      return m;
    },
    async updateMember(mid, patch) {
      const m = members.find((x) => x.id === mid);
      if (!m) return null;
      Object.assign(m, patch);
      return m;
    },
    async deleteMember(mid) { const i = members.findIndex((x) => x.id === mid); if (i >= 0) members.splice(i, 1); },

    async createSession(memberId, tokenHash, expiresAt) {
      const s = { id: id(), member_id: memberId, token_hash: tokenHash, expires_at: expiresAt, created_at: now() };
      sessions.push(s);
      return s;
    },
    async findSessionByTokenHash(hash) { return sessions.find((s) => s.token_hash === hash) || null; },
    async deleteSession(sid) { const i = sessions.findIndex((s) => s.id === sid); if (i >= 0) sessions.splice(i, 1); },
    async deleteSessionsForMember(mid) { for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i].member_id === mid) sessions.splice(i, 1); },

    async recordLoginAttempt(memberId, success, reason) {
      attempts.push({ id: id(), member_id: memberId, success, reason: reason || null, created_at: now() });
    },
    async countRecentFailures(memberId, minutes) {
      const since = Date.now() - minutes * 60 * 1000;
      return attempts.filter((a) => a.member_id === memberId && !a.success && new Date(a.created_at).getTime() >= since).length;
    },
    async listLoginAttempts(limit = 100) { return [...attempts].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit); },

    async getSetting(key) { return settings.has(key) ? settings.get(key) : null; },
    async setSetting(key, value) { settings.set(key, value); },

    async listTransactions() { return [...transactions].sort((a, b) => b.tx_date.localeCompare(a.tx_date) || b.created_at.localeCompare(a.created_at)); },
    async getTransaction(tid) { return transactions.find((t) => t.id === tid) || null; },
    async createTransaction(data) { const t = { id: id(), created_at: now(), ...data }; transactions.push(t); return t; },
    async updateTransaction(tid, patch) { const t = transactions.find((x) => x.id === tid); if (!t) return null; Object.assign(t, patch); return t; },
    async deleteTransaction(tid) { const i = transactions.findIndex((x) => x.id === tid); if (i >= 0) transactions.splice(i, 1); },

    async listProjects() { return [...projects].sort((a, b) => a.created_at.localeCompare(b.created_at)); },
    async getProject(pid) { return projects.find((p) => p.id === pid) || null; },
    async createProject(data) { const p = { id: id(), created_at: now(), status: 'open', kind: 'priced', description: '', ...data }; projects.push(p); return p; },
    async updateProject(pid, patch) { const p = projects.find((x) => x.id === pid); if (!p) return null; Object.assign(p, patch); return p; },
    async deleteProject(pid) {
      const i = projects.findIndex((x) => x.id === pid); if (i >= 0) projects.splice(i, 1);
      for (let k = items.length - 1; k >= 0; k--) if (items[k].project_id === pid) items.splice(k, 1);
      for (let k = distributions.length - 1; k >= 0; k--) if (distributions[k].project_id === pid) distributions.splice(k, 1);
      for (let k = transactions.length - 1; k >= 0; k--) if (transactions[k].project_id === pid) transactions[k].project_id = null;
    },

    async listProjectItems(pid) { return items.filter((x) => x.project_id === pid).sort((a, b) => a.created_at.localeCompare(b.created_at)); },
    async getProjectItem(iid) { return items.find((x) => x.id === iid) || null; },
    async createProjectItem(data) { const it = { id: id(), created_at: now(), ...data }; items.push(it); return it; },
    async deleteProjectItem(iid) { const i = items.findIndex((x) => x.id === iid); if (i >= 0) items.splice(i, 1); },

    async listDistributions(pid) { return distributions.filter((x) => x.project_id === pid).sort((a, b) => b.dist_date.localeCompare(a.dist_date)); },
    async createDistribution(data) { const d = { id: id(), created_at: now(), ...data }; distributions.push(d); return d; },
    async deleteDistribution(did) { const i = distributions.findIndex((x) => x.id === did); if (i >= 0) distributions.splice(i, 1); },

    async logActivity(entry) { activity.unshift({ id: id(), created_at: now(), old_value: null, new_value: null, ...entry }); },
    async listActivity(limit = 200) { return activity.slice(0, limit); },

    async listNotifications(memberId) { return notifications.filter((n) => n.member_id === memberId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100); },
    async createNotification(memberId, message) { notifications.push({ id: id(), member_id: memberId, message, is_read: false, created_at: now() }); },
    async markNotificationsRead(memberId) { notifications.forEach((n) => { if (n.member_id === memberId) n.is_read = true; }); },
  };
}
