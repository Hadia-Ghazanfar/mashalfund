# Mash'al Fund Manager — standalone app

Fund management for **Mash'al Initiative** (`mash'al | مشعل`), rebuilt as a
standalone, source-controlled web app — ready for GitHub + Vercel at
**mashalfund.vercel.app**. This is a fresh codebase, not the Muse artifact:
the artifact's data does **not** carry over; this deployment gets its own
fresh database (same as the Daybill standalone port).

Brand: warm cream `#F7F2E9`, sage `#8AA899`, dusty blue `#7FA8B8`,
terracotta `#E08A5A`, dark teal-slate `#2F4A4A`. Vision: *"No one feels
unseen. No one is left without support. And everyone has the opportunity to
move forward."*

## What it does

- **Dashboard** — total funds with a hide-amount eye, recent activity, spend-by-month graph, drives summary.
- **Add Funds** (separate page) — donations in / expenses out, with category
  (incl. Transport), date, and a statement with running balance.
  Export: weekly / 15 days / monthly, plus CSV download.
- **Drives / Projects** — blank drive name, item-wise costing
  (e.g. sunflower seeds 1 kg × Rs. 200 + plastic bags 50 × Rs. 10), each
  item's total is **auto-deducted from the funds**; deleting an item returns
  the money. Clothes drive is **quantity-based** (type, condition, donor,
  recipient, people reached, proof — no price).
- **Analysis** — spend by drive, by category, per member.
- **Profile** — team admin, Security (change password, admin sign-in log),
  Appearance (Light / Dark / System theme, saved on device).
- **Notifications** — who added/edited funds (cross-member), sign-ups
  awaiting approval. **Audit trail** — who changed what, old → new values.
- **Auth** — Sign in / Sign up tabs. Sign in is member-picker + password
  (approved, active members only). Sign up creates a **PENDING** account:
  no session, cannot sign in, sees nothing until an admin approves it in
  Profile (Approve activates / Reject removes); admins get a notification.
  First account becomes admin; afterwards only a signed-in admin can add
  members. Passwords: PBKDF2-HMAC-SHA256, 210k iterations, per-member salt,
  hashes only, never readable. Sessions: 30 days, only the SHA-256 hash of
  the token is stored server-side. 5 wrong passwords = 15-minute lock, all
  attempts logged. Password change needs the current password and signs out
  other devices; admin reset forces a fresh password + sign-out everywhere.
  Legacy PIN / temporary-password flow is kept: sign in once with the old
  PIN/temp, then you must set a real password (its hash is stored as
  `salt:hash` in `legacy_pin_hash`).
- **PWA** — manifest (`Mash'al Fund Manager`, standalone, brand colours,
  192px + 512px icons from the logo), service worker (offline shell,
  cache-first for assets, network-first for `/api/`), "Install the app"
  buttons on the login page and sidebar. Installable on Android → APK via
  PWABuilder / Chrome "Install app".
- Mobile-first: fits ~400px, no horizontal scroll. English-only UI.

Seeded drives (no money entries, added from Profile → "Add Mash'al example
drives" or `db/seed.sql`): Gift a Tree, Share a Shade, Free Bird Seed
Packets, Cats Food Drive, Clothes Drive.

## Structure

```
mashalfund-standalone/
  public/            static frontend (no build step): index.html, app.js,
                     styles.css, logo.svg, icon-192.png, icon-512.png,
                     manifest.webmanifest, sw.js
  api/               Vercel serverless backend (Node)
    [action].js      POST /api/<action> — one dynamic route, all actions
    handlers.js      all action logic (auth, funds, drives, audit…)
    _lib.js          PBKDF2, session tokens, lockout, auth helpers
    _store-pg.js     Postgres store (production)
    _store-memory.js in-memory store (local dev / tests only)
  db/schema.sql      Postgres schema — run once in Supabase
  db/seed.sql        seed drives (run once, after schema.sql)
  server.js          local dev server (serves public/ + /api/*)
  test/test-flow.mjs end-to-end flow test (25 checks)
  vercel.json, package.json, .env.example, .gitignore
```

## Setup — exact steps (Hadia does the credential parts herself)

### 1. GitHub repo (do NOT upload `node_modules/` — Vercel installs it)
1. On github.com, create a **new public repo** named `mashalfund`
   (owner: Hadia-Ghazanfar).
2. Upload this whole folder into it (Add file → Upload files), **except**
   `node_modules/` (already deleted here; `.gitignore` also excludes it).
   The repo should end up with `public/`, `api/`, `db/`, `server.js`,
   `package.json`, `vercel.json`, `README.md`, etc. — no file over 10 MB,
   no symlinks.

### 2. Supabase database
1. On supabase.com, create a **new project** (any region; name it
   `mashalfund`). Wait for it to finish provisioning.
2. Open the project → **SQL Editor** → New query → paste the whole of
   `db/schema.sql` → Run. (Creates the 10 tables.)
3. Optional: run `db/seed.sql` the same way to add the 5 real drives.
   (The app can also seed them from Profile once you are signed in.)
4. Project Settings → **Database** → Connection string → copy the
   **Session pooler** URI (port **6543**, `?sslmode=require` at the end).
   It looks like:
   `postgresql://postgres.xxxx:YOUR_DB_PASSWORD@aws-0-…pooler.supabase.com:6543/postgres?sslmode=require`
   — the password is the one you chose when creating the Supabase project.
   **Never paste this password in chat.**

### 3. Vercel
1. On vercel.com, **Add New → Project → Import** the `mashalfund` repo.
   (Team: the same team used for `mashalinitiative`.)
2. Before deploying, go to **Settings → Environment Variables** and add:
   - `DATABASE_URL` = the Session pooler URI from step 2.4
     (set it for Production, Preview **and** Development).
3. Deploy. Vercel runs `npm install` (installs `pg`) and serves `public/`;
   `/api/*` goes to the serverless function.
4. Go to **Settings → Domains** and add `mashalfund.vercel.app` as the
   project domain (it should be the default already — check that it is
   not taken by anyone else; it returned 404 / nothing on Nov 13, 2026).

### 4. First sign-in
1. Open https://mashalfund.vercel.app — the login page shows the Mash'al
   logo and Sign in / Sign up tabs. No accounts exist yet, so it shows
   "Set up the team account": enter your name + a password
   (8+ characters, a letter and a number). That first account becomes
   **admin**.
2. From Profile, add the other members (or let them Sign up and approve
   them in "Waiting for approval").
3. Try the old-PIN step only if you are migrating accounts from the Muse
   artifact: an admin can set a member's `legacy_pin_hash` (format
   `salt:hash`, PBKDF2 of the 4-digit PIN) — otherwise skip it; new
   accounts just use passwords.

### 5. APK
1. On an Android phone, open https://mashalfund.vercel.app in Chrome.
2. Tap **"Install the app"** on the login page (or Chrome menu → Install
   app / Add to Home screen). The app installs with the Mash'al icon and
   opens full-screen, like a native app.
3. For a real APK file (Play Store / sideload), feed the same URL into
   [PWABuilder](https://www.pwabuilder.com/) and download the Android
   package it generates.

## Local development / testing

```bash
npm install
npm run dev          # http://localhost:3000 (in-memory store; data resets on restart)
# or, with a real database:
DATABASE_URL=postgresql://… npm run dev
npm test             # runs test/test-flow.mjs against localhost:3000
```

Tested Nov 13, 2026 on this machine (Node 24, no real Supabase DB):
**25/25 flow checks passed** against the local server with the in-memory
store — sign-up → pending → login refused → admin approve → sign in;
Rs. 10,000 in, bird-seed items Rs. 200 + Rs. 500, balance Rs. 9,300;
transport Rs. 350, balance Rs. 8,950; clothes distribution (qty-based);
statement with running balance; cross-member notification; audit trail;
password change (wrong current refused, new password works, old sessions
revoked); non-admin cannot update members; forged token refused.
Lockout was also verified separately: 5 wrong passwords → 6th attempt
returns 429 "locked for 15 minutes", and even the correct password is
refused while locked. All PWA/static files serve 200
(manifest, sw.js, logo, icons, styles, app).
**Not yet tested:** the Postgres store against a real Supabase database
(the SQL is standard `pg` parameterised queries against `db/schema.sql`,
but it needs a live DB to prove), and the Vercel deployment itself.

## Notes / deliberate limits

- The Muse artifact's data does **not** migrate — this deployment starts
  with an empty database. Re-enter the real fund figures once live, or
  ask for a data-export step before going live.
- The in-memory store is for local testing only. On Vercel, `DATABASE_URL`
  must be set or every `/api/*` call fails with a clear 500.
- No credentials, passwords, or tokens are in this repo. `.env.example`
  shows only the shape of `DATABASE_URL`.
