# SubScroll — Cloudflare Worker password accounts

This repository is configured for the existing Cloudflare **Worker service named `subscroll`**. It is not a Pages project.

The Worker uses ES-module syntax and Workers Static Assets:

- `src/worker.js` exports the module Worker and handles `/api/*`;
- `public/` contains the static site;
- `wrangler.jsonc` deploys both parts and binds D1 as `SUBSCROLL_DB`;
- `migrations/0001_accounts.sql` creates the only required table.

## Account behaviour

- There is no username or email. The password is the account identifier and credential.
- First use of a password creates its saved space; the same password opens it on another browser.
- Passwords are never stored. A stable `AUTH_SECRET` derives an opaque account ID and signs the 30-day HttpOnly session cookie.
- Reddit client ID, groups, favourites and preferences are saved in Cloudflare D1.
- Reddit access tokens remain only in browser memory.
- Old browser data is migrated once from `localStorage` to D1, then deleted from `localStorage`.

This intentionally simple design is for a small, non-production app and fits Cloudflare's free tier.

## Deploy to the existing `subscroll` Worker

### 1. Replace the repository contents

Commit this project at the root of the private repository connected to the Worker. Do not put it inside an extra parent directory unless the Worker's root-directory setting is changed to match.

The important files are:

```text
wrangler.jsonc
src/worker.js
src/api/
src/lib/
public/
migrations/0001_accounts.sql
```

The old legacy Worker containing `addEventListener(...)` must not remain as the deployment entrypoint. `wrangler.jsonc` now sets `main` to `src/worker.js`, whose `export default { fetch(...) }` makes it an ES-module Worker.

### 2. Keep or create the D1 database

The Wrangler configuration requests a D1 database named `subscroll` and binds it as `SUBSCROLL_DB`:

```json
{
  "binding": "SUBSCROLL_DB",
  "database_name": "subscroll"
}
```

Current Wrangler versions resolve the existing database by name, or provision it if it does not exist. This avoids the dashboard error that occurred when trying to attach D1 to the legacy Service Worker first: the module Worker and its D1 binding are now deployed together.

If automatic lookup is disabled in the account, get the UUID from **Storage & Databases → D1 → subscroll** and add this property beside `database_name` in `wrangler.jsonc`:

```json
"database_id": "YOUR-D1-DATABASE-UUID"
```

### 3. Apply the schema once

If the table was already created in the D1 Console, skip this step. Otherwise, run the contents of `migrations/0001_accounts.sql` in the database's Cloudflare dashboard Console.

With Wrangler authentication available, the equivalent command is:

```bash
npx wrangler d1 migrations apply subscroll --remote
```

The migration uses `CREATE TABLE IF NOT EXISTS`, so applying it again is harmless.

### 4. Add the stable encrypted secret

On the **subscroll Worker**, open **Settings → Variables and Secrets** and add an encrypted secret:

- name: `AUTH_SECRET`
- value: a random string of at least 32 characters

Generate one locally with:

```bash
openssl rand -hex 32
```

Keep this exact value permanently. Changing it makes existing password-derived accounts and sessions unreachable. `keep_vars: true` in `wrangler.jsonc` prevents dashboard-managed variables from being removed by deployment.

### 5. Configure the Worker build

For the private-repository Workers Build, use:

- Build command: blank, or `npm install`
- Deploy command: `npx wrangler deploy`
- Root directory: the directory containing `wrangler.jsonc`

Then push/merge and redeploy the existing `subscroll` Worker. Do **not** create a Pages project and do not manually attach D1 before this module deployment.

Wrangler will deploy:

1. the ES-module Worker from `src/worker.js`;
2. static files from `public/`;
3. the D1 binding named `SUBSCROLL_DB`.

Existing custom domains and routes attached to the `subscroll` service should continue to target that same service.

## Cloudflare Agent prompt

After these files are committed, this is a suitable instruction for Cloudflare's agent:

> Redeploy the existing Worker service `subscroll` from its connected repository. Use the repository's `wrangler.jsonc` and the deploy command `npx wrangler deploy`. This is an ES-module Worker with Static Assets, not a Pages project. Preserve the encrypted `AUTH_SECRET`. Confirm that the D1 database named `subscroll` is bound to the module Worker as `SUBSCROLL_DB`, then confirm the deployment health.

## Verify after deployment

1. Open the normal SubScroll URL. The password screen should appear.
2. Enter a password of at least 8 characters.
3. Open `/api/session` on the same hostname; it should return `{"authenticated":true}` while signed in.
4. Change a group or setting, reload, and confirm it remains.
5. Sign in with the same password in another browser and confirm the same state loads.

A `500` response saying Cloudflare is not configured means either `AUTH_SECRET` is absent/too short or the D1 binding was not deployed. A D1 error saying the `accounts` table is missing means the migration still needs to be applied.

## API routes

- `POST /api/session` — create/open the password account
- `GET /api/session` — report session status
- `DELETE /api/session` — sign out
- `GET /api/state` — load saved state
- `PUT /api/state` — validate and save state (maximum 128 KiB)

All API responses are `no-store`.

## Intentional limitations

- no password recovery or password change;
- a mistyped password creates a different empty account;
- no application-level login rate limiter;
- last save wins if two devices edit simultaneously;
- state is readable by the Cloudflare account owner and is not end-to-end encrypted;
- intended only for personal/non-production use.
