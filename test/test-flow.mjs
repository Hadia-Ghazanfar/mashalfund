// End-to-end flow test against a running local server (in-memory store).
//   1. npm run dev          (in another terminal, or set BASE_URL)
//   2. node test/test-flow.mjs
// Uses only the public /api/* surface — the same calls the frontend makes.
const BASE = process.env.BASE_URL || 'http://localhost:3000';

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name, extra); }
}
async function call(action, args = {}) {
  const res = await fetch(`${BASE}/api/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

console.log('Mash\'al Fund Manager — flow test against', BASE);

// 1. Bootstrap: no members yet
let r = await call('bootstrap', {});
check('bootstrap returns member list', r.status === 200 && Array.isArray(r.data.members));

// 2. First sign-up becomes admin and is active
r = await call('signup', { name: 'Hadia', password: 'Hadia1234', confirmPassword: 'Hadia1234' });
check('first sign-up becomes active admin', r.status === 200 && r.data.status === 'active' && r.data.member.role === 'admin', JSON.stringify(r.data));
const admin = r.data.member; const adminAuth = { memberId: admin.id, token: r.data.token };

// 3. Weak password rejected
r = await call('signup', { name: 'Weak', password: 'abc', confirmPassword: 'abc' });
check('weak password rejected', r.status === 400, JSON.stringify(r.data));

// 4. Second sign-up is PENDING
r = await call('signup', { name: 'Tahoor', password: 'Tahoor123', confirmPassword: 'Tahoor123' });
check('second sign-up is pending', r.status === 200 && r.data.status === 'pending', JSON.stringify(r.data));
const pending = r.data.member;

// 5. Pending account cannot sign in
r = await call('login', { memberId: pending.id, password: 'Tahoor123' });
check('pending login refused', r.status === 403 && /waiting for approval/i.test(r.data.error || ''), JSON.stringify(r.data));

// 6. Wrong password fails; 5 fails lock the account (use a fresh member to avoid locking Hadia)
r = await call('login', { memberId: admin.id, password: 'Wrong1234' });
check('wrong password refused', r.status === 401, JSON.stringify(r.data));

// 7. Admin approves the pending member
r = await call('updateMember', { memberId: pending.id, status: 'active', auth: adminAuth });
check('admin approves pending member', r.status === 200 && r.data.member.status === 'active', JSON.stringify(r.data));

// 8. Approved member can now sign in
r = await call('login', { memberId: pending.id, password: 'Tahoor123' });
check('approved member signs in', r.status === 200 && !!r.data.token, JSON.stringify(r.data));
const tahoorAuth = { memberId: pending.id, token: r.data.token };

// 9. Seed the real drives
r = await call('seedExamples', { auth: adminAuth });
check('seed drives created', r.status === 200 && r.data.added === 5, JSON.stringify(r.data));
r = await call('listProjects', { auth: adminAuth });
const bird = r.data.projects.find((p) => p.name === 'Free Bird Seed Packets');
check('Free Bird Seed Packets drive exists', !!bird, JSON.stringify(r.data.projects.map((p) => p.name)));

// 10. Add funds Rs. 10,000
r = await call('addTransaction', { kind: 'donation', amount: 10000, note: 'Opening funds', category: 'Donation', auth: adminAuth });
check('add funds Rs. 10,000', r.status === 200, JSON.stringify(r.data));

// 11. Bird-seed item: sunflower seeds 1kg x Rs 200 + plastic bags 50 x Rs 10 = Rs 700 deducted
r = await call('addProjectItem', { projectId: bird.id, name: 'Sunflower seeds 1 kg', qty: 1, unitPrice: 200, auth: adminAuth });
check('sunflower seeds item Rs. 200', r.status === 200 && r.data.item.total === 200, JSON.stringify(r.data));
r = await call('addProjectItem', { projectId: bird.id, name: 'Plastic bags', qty: 50, unitPrice: 10, auth: adminAuth });
check('plastic bags item Rs. 500', r.status === 200 && r.data.item.total === 500, JSON.stringify(r.data));
r = await call('getDashboard', { auth: adminAuth });
check('balance is Rs. 9,300 after Rs. 700 drive spend', r.status === 200 && r.data.balance === 9300, `balance=${r.data?.balance}`);

// 12. Transport expense Rs. 350
r = await call('addTransaction', { kind: 'expense', amount: 350, note: 'Transport to park', category: 'Transport', auth: tahoorAuth });
check('transport expense Rs. 350', r.status === 200, JSON.stringify(r.data));
r = await call('getDashboard', { auth: adminAuth });
check('balance is Rs. 8,950 after transport', r.data.balance === 8950, `balance=${r.data?.balance}`);

// 13. Clothes drive: quantity-based distribution, no price
r = await call('listProjects', { auth: adminAuth });
const clothes = r.data.projects.find((p) => p.name === 'Clothes Drive');
r = await call('addDistribution', { projectId: clothes.id, itemType: 'Winter jacket', condition: 'Good', qty: 3, donor: 'Ayesha', recipient: 'Family in Lahore', proof: 'Photo taken', auth: tahoorAuth });
check('clothes distribution recorded (qty-based)', r.status === 200 && r.data.distribution.qty === 3, JSON.stringify(r.data));

// 14. Statement (30 days) has running balance
r = await call('getStatement', { days: 30, auth: adminAuth });
check('statement has lines with running balance', r.status === 200 && r.data.lines.length >= 3 && typeof r.data.lines[0].balance === 'number', JSON.stringify(r.data.lines?.length));

// 15. Notifications: Tahoor sees Hadia's fund change (cross-member)
r = await call('listNotifications', { auth: tahoorAuth });
check('cross-member notification delivered', r.status === 200 && r.data.notifications.length > 0, JSON.stringify(r.data.notifications?.length));

// 16. Audit trail records the changes
r = await call('listActivity', { auth: adminAuth });
check('audit trail has entries', r.status === 200 && r.data.activity.length >= 5, JSON.stringify(r.data.activity?.length));

// 17. Password change needs current password and signs out other devices
r = await call('changeOwnPassword', { currentPassword: 'Wrong1234', newPassword: 'Hadia9999', confirmPassword: 'Hadia9999', auth: adminAuth });
check('password change with wrong current password refused', r.status === 401, JSON.stringify(r.data));
r = await call('changeOwnPassword', { currentPassword: 'Hadia1234', newPassword: 'Hadia9999', confirmPassword: 'Hadia9999', auth: adminAuth });
check('password change works', r.status === 200, JSON.stringify(r.data));
r = await call('login', { memberId: admin.id, password: 'Hadia9999' });
check('sign in with new password works', r.status === 200 && !!r.data.token, JSON.stringify(r.data));

// 18. Non-admin cannot approve members
r = await call('updateMember', { memberId: admin.id, status: 'inactive', auth: tahoorAuth });
check('non-admin cannot update members', r.status === 403, JSON.stringify(r.data));

// 19. Unauthenticated dashboard is refused (no bare member ID trusted)
r = await call('getDashboard', { auth: { memberId: admin.id, token: 'forged-token' } });
check('forged token refused', r.status === 401, JSON.stringify(r.data));

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
