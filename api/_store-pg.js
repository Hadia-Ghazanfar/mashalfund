// Postgres store — production (Vercel + Supabase). Requires DATABASE_URL.
// Uses the `pg` package. Tables are created by db/schema.sql (run once in
// Supabase). All queries are parameterised; no string-built SQL with values.
import pg from 'pg';

const { Pool } = pg;

let pool = null;
export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
  }
  return pool;
}

function rowToMember(r) { return r; }

export function createPgStore() {
  const p = getPool();
  const q = (text, params = []) => p.query(text, params);

  return {
    kind: 'postgres',
    async listMembers() { const { rows } = await q('select * from members order by created_at asc'); return rows.map(rowToMember); },
    async getMember(mid) { const { rows } = await q('select * from members where id = $1', [mid]); return rows[0] || null; },
    async findMemberByName(name) {
      const { rows } = await q('select * from members where lower(trim(name)) = lower(trim($1)) limit 1', [name]);
      return rows[0] || null;
    },
    async createMember(d) {
      const { rows } = await q(
        `insert into members (name, role, status, password_hash, password_salt, legacy_pin_hash, must_change_password)
         values ($1,$2,$3,$4,$5,$6,$7) returning *`,
        [d.name, d.role || 'member', d.status || 'active', d.password_hash || null, d.password_salt || null, d.legacy_pin_hash || null, !!d.must_change_password]);
      return rows[0];
    },
    async updateMember(mid, patch) {
      const keys = Object.keys(patch);
      if (!keys.length) return this.getMember(mid);
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const { rows } = await q(`update members set ${sets} where id = $1 returning *`, [mid, ...keys.map((k) => patch[k])]);
      return rows[0] || null;
    },
    async deleteMember(mid) { await q('delete from members where id = $1', [mid]); },

    async createSession(memberId, tokenHash, expiresAt) {
      const { rows } = await q('insert into sessions (member_id, token_hash, expires_at) values ($1,$2,$3) returning *', [memberId, tokenHash, expiresAt]);
      return rows[0];
    },
    async findSessionByTokenHash(hash) { const { rows } = await q('select * from sessions where token_hash = $1', [hash]); return rows[0] || null; },
    async deleteSession(sid) { await q('delete from sessions where id = $1', [sid]); },
    async deleteSessionsForMember(mid) { await q('delete from sessions where member_id = $1', [mid]); },

    async recordLoginAttempt(memberId, success, reason) {
      await q('insert into login_attempts (member_id, success, reason) values ($1,$2,$3)', [memberId, success, reason || null]);
    },
    async countRecentFailures(memberId, minutes) {
      const { rows } = await q(
        `select count(*)::int as c from login_attempts
         where member_id = $1 and success = false and created_at >= now() - ($2 || ' minutes')::interval`,
        [memberId, String(minutes)]);
      return rows[0].c;
    },
    async listLoginAttempts(limit = 100) {
      const { rows } = await q('select * from login_attempts order by created_at desc limit $1', [limit]);
      return rows;
    },

    async getSetting(key) { const { rows } = await q('select value from settings where key = $1', [key]); return rows[0] ? rows[0].value : null; },
    async setSetting(key, value) {
      await q(`insert into settings (key, value) values ($1,$2)
               on conflict (key) do update set value = excluded.value, updated_at = now()`, [key, value]);
    },

    async listTransactions() { const { rows } = await q('select * from transactions order by tx_date desc, created_at desc'); return rows; },
    async getTransaction(tid) { const { rows } = await q('select * from transactions where id = $1', [tid]); return rows[0] || null; },
    async createTransaction(d) {
      const { rows } = await q(
        `insert into transactions (kind, amount, note, category, project_id, member_id, member_name, tx_date)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [d.kind, d.amount, d.note || '', d.category || 'General', d.project_id || null, d.member_id || null, d.member_name || '', d.tx_date || new Date().toISOString().slice(0, 10)]);
      return rows[0];
    },
    async updateTransaction(tid, patch) {
      const keys = Object.keys(patch);
      if (!keys.length) return this.getTransaction(tid);
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const { rows } = await q(`update transactions set ${sets} where id = $1 returning *`, [tid, ...keys.map((k) => patch[k])]);
      return rows[0] || null;
    },
    async deleteTransaction(tid) { await q('delete from transactions where id = $1', [tid]); },

    async listProjects() { const { rows } = await q('select * from projects order by created_at asc'); return rows; },
    async getProject(pid) { const { rows } = await q('select * from projects where id = $1', [pid]); return rows[0] || null; },
    async createProject(d) {
      const { rows } = await q('insert into projects (name, kind, status, description) values ($1,$2,$3,$4) returning *',
        [d.name, d.kind || 'priced', d.status || 'open', d.description || '']);
      return rows[0];
    },
    async updateProject(pid, patch) {
      const keys = Object.keys(patch);
      if (!keys.length) return this.getProject(pid);
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const { rows } = await q(`update projects set ${sets} where id = $1 returning *`, [pid, ...keys.map((k) => patch[k])]);
      return rows[0] || null;
    },
    async deleteProject(pid) { await q('delete from projects where id = $1', [pid]); },

    async listProjectItems(pid) { const { rows } = await q('select * from project_items where project_id = $1 order by created_at asc', [pid]); return rows; },
    async getProjectItem(iid) { const { rows } = await q('select * from project_items where id = $1', [iid]); return rows[0] || null; },
    async createProjectItem(d) {
      const { rows } = await q('insert into project_items (project_id, name, qty, unit_price, total) values ($1,$2,$3,$4,$5) returning *',
        [d.project_id, d.name, d.qty, d.unit_price, d.total]);
      return rows[0];
    },
    async deleteProjectItem(iid) { await q('delete from project_items where id = $1', [iid]); },

    async listDistributions(pid) { const { rows } = await q('select * from distributions where project_id = $1 order by dist_date desc', [pid]); return rows; },
    async createDistribution(d) {
      const { rows } = await q(
        `insert into distributions (project_id, item_type, condition, qty, donor, recipient, proof, member_id, member_name, dist_date)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
        [d.project_id, d.item_type, d.condition || '', d.qty, d.donor || '', d.recipient || '', d.proof || '', d.member_id || null, d.member_name || '', d.dist_date || new Date().toISOString().slice(0, 10)]);
      return rows[0];
    },
    async deleteDistribution(did) { await q('delete from distributions where id = $1', [did]); },

    async logActivity(e) {
      await q('insert into activity_log (member_id, member_name, action, detail, old_value, new_value) values ($1,$2,$3,$4,$5,$6)',
        [e.member_id || null, e.member_name || '', e.action, e.detail || '', e.old_value || null, e.new_value || null]);
    },
    async listActivity(limit = 200) { const { rows } = await q('select * from activity_log order by created_at desc limit $1', [limit]); return rows; },

    async listNotifications(memberId) {
      const { rows } = await q('select * from notifications where member_id = $1 order by created_at desc limit 100', [memberId]);
      return rows;
    },
    async createNotification(memberId, message) {
      await q('insert into notifications (member_id, message) values ($1,$2)', [memberId, message]);
    },
    async markNotificationsRead(memberId) { await q('update notifications set is_read = true where member_id = $1', [memberId]); },
  };
}
