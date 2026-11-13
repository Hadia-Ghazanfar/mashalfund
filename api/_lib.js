// Shared crypto / auth helpers for the Mash'al Fund Manager backend.
// Passwords: PBKDF2-HMAC-SHA256, 210,000 iterations, per-member salt.
// Only hashes are ever stored. Session tokens: 30 days, only the SHA-256
// hash of the token is stored server-side — never a bare member ID.
import crypto from 'node:crypto';

export const PBKDF2_ITERATIONS = 210000;
export const SESSION_DAYS = 30;
export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MINUTES = 15;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function badRequest(msg) { return new ApiError(400, msg); }
export function unauthorized(msg = 'Please sign in again.') { return new ApiError(401, msg); }
export function forbidden(msg = 'Only an admin can do that.') { return new ApiError(403, msg); }
export function notFound(msg = 'Not found.') { return new ApiError(404, msg); }

export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw)) return 'Password must contain a letter.';
  if (!/[0-9]/.test(pw)) return 'Password must contain a number.';
  return null;
}

export function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

export function verifyPassword(password, saltHex, hashHex) {
  if (!saltHex || !hashHex) return false;
  const { hash } = hashPassword(password, saltHex);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(hashHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function newToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function sessionExpiry() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

// Resolve the signed-in member from { memberId, token }.
// Returns { member, session } or throws 401. Pending/inactive members
// can never act, even with a token.
export async function getActor(store, auth) {
  if (!auth || !auth.memberId || !auth.token) throw unauthorized();
  const session = await store.findSessionByTokenHash(hashToken(auth.token));
  if (!session || session.member_id !== auth.memberId) throw unauthorized();
  if (new Date(session.expires_at) < new Date()) throw unauthorized('Your session has expired. Please sign in again.');
  const member = await store.getMember(auth.memberId);
  if (!member || member.status !== 'active') throw unauthorized();
  return { member, session };
}

export async function requireAdmin(store, auth) {
  const actor = await getActor(store, auth);
  if (actor.member.role !== 'admin') throw forbidden();
  return actor;
}

// Notify every active member except the actor (used for fund changes).
export async function notifyOthers(store, actor, message) {
  const members = await store.listMembers();
  for (const m of members) {
    if (m.id !== actor.member.id && m.status === 'active') {
      await store.createNotification(m.id, message);
    }
  }
}

export function publicMember(m) {
  if (!m) return null;
  return { id: m.id, name: m.name, role: m.role, status: m.status, created_at: m.created_at };
}
