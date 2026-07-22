# Production Hardening VPS Rollout

This runbook deploys the production-hardening release to one PM2 API process. Run every command from the same SSH session. Stop immediately when a check does not match the stated expected result.

## CI deployment prerequisites

The production workflow checks out and tests one immutable `${{ github.sha }}`, then passes that exact 40-character SHA to `/usr/local/bin/deploy-kasir.sh`. Configure these GitHub Actions secrets:

- `VPS_HOST`, `VPS_USER`, and numeric `VPS_PORT`.
- `VPS_SSH_KEY`: a dedicated, unencrypted deployment private key. Passphrase-protected keys are intentionally unsupported by the non-interactive precheck.
- `VPS_SSH_HOST_FINGERPRINT`: one trusted `SHA256:...` SSH host-key fingerprint obtained out-of-band from the VPS console, never from the same network path used by the deployment.

Read the Ed25519 fingerprint directly on the VPS console and compare it with the GitHub secret:

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

The deploy script must check out the requested commit before it installs dependencies, runs migrations, builds, or restarts any process. Its opening sequence must enforce this contract:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www/kasir-aviaoutdoor
RELEASE_COMMIT="${1:?usage: deploy-kasir.sh <40-character-commit-sha>}"
[[ "$RELEASE_COMMIT" =~ ^[0-9a-f]{40}$ ]]

cd "$APP_DIR"
git status --porcelain | grep -q . && {
  echo 'Refusing to deploy over a dirty worktree.' >&2
  exit 1
}
git fetch --prune origin
git cat-file -e "$RELEASE_COMMIT^{commit}"
git checkout --detach "$RELEASE_COMMIT"
test "$(git rev-parse HEAD)" = "$RELEASE_COMMIT"

# Only after the equality check above may the existing script run npm ci,
# Prisma preflight/migrations, build, and PM2 restart steps.
```

The script may not pull or check out `main`, `latest`, or another moving ref after this guard. It must repeat the same HEAD equality check immediately before and after PM2 restart. The workflow also verifies the deployed HEAD after the script returns. Remove the obsolete `VPS_SSH_PASSPHRASE` secret; `VPS_SSH_HOST_FINGERPRINT` is required and host-key checking may not be disabled.

## 1. Set deployment values

The repository and PostgreSQL container defaults match the current VPS. Pre-set `APP_DIR` or `POSTGRES_CONTAINER` before this block to override either value. Replace the remaining values in angle brackets.

```bash
export APP_DIR="${APP_DIR:-/var/www/kasir-aviaoutdoor}"
export POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-avia-postgres}"
export API_DIR="${API_DIR:-$APP_DIR/apps/api}"
export RELEASE_COMMIT=<approved-commit-sha>
export PM2_APP=<api-process-name>
export API_BASE_URL=http://127.0.0.1:4000
export BACKUP_DIR=/var/backups/aviaoutdoor

cd "$APP_DIR"
export PREVIOUS_COMMIT="$(git rev-parse HEAD)"
export ROLLOUT_ID="$(date -u +%Y%m%dT%H%M%SZ)"
printf 'previous=%s\nrelease=%s\nrollout=%s\n' \
  "$PREVIOUS_COMMIT" "$RELEASE_COMMIT" "$ROLLOUT_ID"
```

Keep the printed values in the deployment record. Confirm the worktree is clean before changing revisions:

```bash
git status --short
```

Expected: no output. Stop if the VPS contains uncommitted changes.

## 2. Fetch the release and install dependencies

```bash
git fetch --prune origin
git checkout --detach "$RELEASE_COMMIT"
npm ci
```

Do not restart PM2 yet.

## 3. Back up PostgreSQL

Take and verify the database backup before changing credentials, schema, migration history, access assignments, or application state. Read the current database credentials without printing them. `pg_dump` and `pg_restore` run inside `$POSTGRES_CONTAINER`, so PostgreSQL client tools are not required on the VPS host. The custom-format archive is streamed to the private host backup directory.

```bash
export DATABASE_URL="$(cd "$API_DIR" && env -u DATABASE_URL node --env-file=.env -e 'process.stdout.write(process.env.DATABASE_URL || "")')"
test -n "$DATABASE_URL"
export PGUSER="$(cd "$API_DIR" && env -u DATABASE_URL node --env-file=.env -e 'process.stdout.write(decodeURIComponent(new URL(process.env.DATABASE_URL).username))')"
export PGPASSWORD="$(cd "$API_DIR" && env -u DATABASE_URL node --env-file=.env -e 'process.stdout.write(decodeURIComponent(new URL(process.env.DATABASE_URL).password))')"
export PGDATABASE="$(cd "$API_DIR" && env -u DATABASE_URL node --env-file=.env -e 'process.stdout.write(decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)))')"
test -n "$PGUSER"
test -n "$PGDATABASE"
test "$(docker inspect "$POSTGRES_CONTAINER" --format '{{.State.Running}}')" = true
docker exec -e PGPASSWORD="$PGPASSWORD" "$POSTGRES_CONTAINER" \
  pg_isready --host=127.0.0.1 --username="$PGUSER" --dbname="$PGDATABASE"

sudo install -d -m 700 -o "$(id -un)" "$BACKUP_DIR"
export BACKUP_FILE="$BACKUP_DIR/aviaoutdoor-$ROLLOUT_ID.dump"
export BACKUP_LIST="$BACKUP_DIR/aviaoutdoor-$ROLLOUT_ID.list"
docker exec -e PGPASSWORD="$PGPASSWORD" "$POSTGRES_CONTAINER" \
  pg_dump --host=127.0.0.1 --format=custom --no-owner --no-privileges \
  --username="$PGUSER" --dbname="$PGDATABASE" >"$BACKUP_FILE"
test -s "$BACKUP_FILE"
docker exec -i "$POSTGRES_CONTAINER" pg_restore --list \
  <"$BACKUP_FILE" >"$BACKUP_LIST"
test -s "$BACKUP_LIST"
grep -Eq 'TABLE|TABLE DATA' "$BACKUP_LIST"
ls -lh "$BACKUP_FILE"
unset PGPASSWORD
```

Expected: every command exits `0`; `test -s` proves both files are non-empty, and `pg_restore --list` proves the custom archive is readable by the container's restore tool. The final line shows a non-empty dump owned by the deployment user. Do not continue without this verification.

## 4. Harden and precheck production configuration

Production startup refuses insecure settings. Run the warning check against the current `.env`; it reports warning names but never prints secret values:

```bash
cd "$API_DIR"
env -u DATABASE_URL -u CORS_ORIGIN -u JWT_SECRET -u PASSWORD_PEPPER \
  -u ALLOW_INSECURE_LOOPBACK_CORS \
  -u ADMIN_USERNAME -u ADMIN_PASSWORD -u TRUST_PROXY \
  NODE_ENV=production node --env-file=.env --input-type=module -e '
  import { getEnv, getSecurityWarnings } from "./src/config/env.js";
  const warnings = getSecurityWarnings(getEnv());
  console.log(JSON.stringify({ ok: warnings.length === 0, warnings }));
  process.exitCode = warnings.length === 0 ? 0 : 1;
'
```

The current default `postgres:postgres`, `admin@gmail.com`, `adminavo123`, development secrets, or localhost CORS must produce a nonzero result. Do not attempt to start the production API with those values.

### Preserve or separately rotate `PASSWORD_PEPPER`

Every existing password hash depends on the exact `PASSWORD_PEPPER`. Check it without printing the value:

```bash
cd "$API_DIR"
env -u DATABASE_URL -u CORS_ORIGIN -u JWT_SECRET -u PASSWORD_PEPPER \
  -u ALLOW_INSECURE_LOOPBACK_CORS \
  -u ADMIN_USERNAME -u ADMIN_PASSWORD -u TRUST_PROXY \
  NODE_ENV=production node --env-file=.env --input-type=module -e '
  import { getEnv, getSecurityWarnings } from "./src/config/env.js";
  const warning = getSecurityWarnings(getEnv())
    .find((entry) => entry.startsWith("PASSWORD_PEPPER"));
  console.log(JSON.stringify({ ok: !warning, warning: warning || null }));
  process.exitCode = warning ? 1 : 0;
'
```

If this check exits `0`, preserve the existing `PASSWORD_PEPPER` byte-for-byte. Do not replace it in the steps below. If it reports a default, missing, or weak pepper, stop this rollout. Pepper rotation requires a separate maintenance plan that resets or rehashes every user credential; changing it here would immediately lock out all existing users.

Create the protected configuration rollback copy before entering maintenance:

```bash
cd "$API_DIR"
umask 077
install -m 600 .env ".env.before-$ROLLOUT_ID"
```

### Enter the maintenance window

Stop, but do not delete, the API process immediately before rotating the database role password. From this point until the final restart, Nginx may return an upstream error; no API writes may continue with mixed credentials.

```bash
pm2 stop "$PM2_APP"
pm2 describe "$PM2_APP"
pm2 jlist | jq -e --arg name "$PM2_APP" \
  '.[] | select(.name == $name) | .pm2_env.status == "stopped"'
```

Expected: the assertion exits `0` and PM2 reports `stopped`. Do not rotate credentials while any API process or replica can still write to this database.

### Rotate the initialized PostgreSQL role password

Changing Docker `POSTGRES_PASSWORD` after the data directory has been initialized does not change the PostgreSQL role. Rotate the actual role interactively inside the running container; `\password` prompts twice and does not place the new password in shell history or SQL logs:

```bash
docker exec -it "$POSTGRES_CONTAINER" \
  psql --no-psqlrc --username=postgres --dbname=postgres \
  --command='\password postgres'
```

Update the Docker Compose secret or protected environment source for `POSTGRES_PASSWORD` to the same new value so a future empty-volume initialization does not restore the default. Do not print or commit that value.

### Prepare the hardened API environment

Enter the new database password and admin password through hidden prompts. Use the real browser-facing HTTPS origin, without a path. Multiple origins may be comma-separated, but every production origin must use HTTPS.

```bash
cd "$API_DIR"
export CURRENT_DATABASE_URL="$(node --env-file=.env -e 'process.stdout.write(process.env.DATABASE_URL || "")')"
test -n "$CURRENT_DATABASE_URL"
read -rsp 'Re-enter new PostgreSQL password for DATABASE_URL: ' NEW_DB_PASSWORD; printf '\n'
read -rp 'Production HTTPS CORS origin: ' NEW_CORS_ORIGIN
read -rp 'New non-default platform admin username: ' NEW_ADMIN_USERNAME
read -rsp 'New platform admin password (16+ characters): ' NEW_ADMIN_PASSWORD; printf '\n'
test "$NEW_ADMIN_USERNAME" != 'admin@gmail.com'
test "${#NEW_ADMIN_PASSWORD}" -ge 16
export NEW_JWT_SECRET="$(openssl rand -hex 48)"
export NEW_DATABASE_URL="$(CURRENT_DATABASE_URL="$CURRENT_DATABASE_URL" NEW_DB_PASSWORD="$NEW_DB_PASSWORD" node -e '
  const url = new URL(process.env.CURRENT_DATABASE_URL);
  url.password = process.env.NEW_DB_PASSWORD;
  process.stdout.write(url.toString());
')"
NEW_CORS_ORIGIN="$NEW_CORS_ORIGIN" node -e '
  const origins = process.env.NEW_CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean);
  if (origins.length === 0) process.exit(1);
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.protocol !== "https:" || origin !== url.origin) process.exit(1);
  }
'
```

Default `TRUST_PROXY=false` is safe. Set it to `true` only after inspecting the effective Nginx `location` that proxies this API and confirming it discards any client-supplied `X-Forwarded-For` and overwrites it with `$remote_addr`. Do not infer this from a matching directive in an unrelated virtual host or location. This application trusts the first forwarded address, so appending an untrusted header is insufficient.

```bash
export NEW_TRUST_PROXY=false
# Change to true only after the exact API proxy location passes the review above.
printf 'TRUST_PROXY will be set to %s\n' "$NEW_TRUST_PROXY"
```

Update `.env` atomically. The updater intentionally leaves `PASSWORD_PEPPER` unchanged and prints no values:

```bash
cd "$API_DIR"
DATABASE_URL="$NEW_DATABASE_URL" \
CORS_ORIGIN="$NEW_CORS_ORIGIN" \
ALLOW_INSECURE_LOOPBACK_CORS=false \
JWT_SECRET="$NEW_JWT_SECRET" \
ADMIN_USERNAME="$NEW_ADMIN_USERNAME" \
ADMIN_PASSWORD="$NEW_ADMIN_PASSWORD" \
TRUST_PROXY="$NEW_TRUST_PROXY" \
node <<'NODE'
const { chmodSync, readFileSync, renameSync, writeFileSync } = require('node:fs');

const replacements = {
  NODE_ENV: 'production',
  DATABASE_URL: process.env.DATABASE_URL,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  ALLOW_INSECURE_LOOPBACK_CORS: process.env.ALLOW_INSECURE_LOOPBACK_CORS,
  JWT_SECRET: process.env.JWT_SECRET,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  TRUST_PROXY: process.env.TRUST_PROXY,
};
let content = readFileSync('.env', 'utf8');

for (const [key, value] of Object.entries(replacements)) {
  if (!value || /[\r\n]/.test(value)) throw new Error(`Invalid ${key}`);
  const line = `${key}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  content = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.replace(/\s*$/, '\n')}${line}\n`;
}

const temporaryPath = `.env.${process.pid}.tmp`;
writeFileSync(temporaryPath, content, { mode: 0o600 });
renameSync(temporaryPath, '.env');
chmodSync('.env', 0o600);
NODE
export DATABASE_URL="$NEW_DATABASE_URL"
```

Keep `ALLOW_INSECURE_LOOPBACK_CORS=false` for the public production service. The only supported exception is a direct local production smoke test whose browser origin is exactly `http://localhost`, `http://127.0.0.1`, or `http://[::1]`; enabling it never permits a remote HTTP origin.

Production startup also rejects values above these ceilings: request body `10 MiB`, body timeout `60 s`, request timeout `120 s`, header timeout `60 s`, keep-alive timeout `60 s`, and `10,000` requests per socket. Lower values in `.env` are encouraged; raising a value above its ceiling requires a reviewed code change rather than an environment-only bypass.

Verify the rotated database password over TCP, then use the dedicated command to create or update only the configured platform-admin password hash with the preserved pepper:

```bash
export PGDATABASE="$(NEW_DATABASE_URL="$NEW_DATABASE_URL" node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.NEW_DATABASE_URL).pathname.slice(1)))')"
docker exec -e PGPASSWORD="$NEW_DB_PASSWORD" "$POSTGRES_CONTAINER" \
  psql --no-psqlrc --host=127.0.0.1 --username=postgres --dbname="$PGDATABASE" \
  --command='SELECT 1' >/dev/null
cd "$APP_DIR"
npm run admin:rotate-credentials --workspace @avia/api
```

Changing `ADMIN_PASSWORD` alone does not update an existing same-username hash during normal startup. `admin:rotate-credentials` upserts only `ADMIN_USERNAME` with the new password hash and `superuser` role; it does not seed or alter tenants, branches, catalog data, or other users. When `ADMIN_USERNAME` changes, the previous stored user remains in the database but no longer receives effective platform-superuser access because authorization recognizes only the configured username.

Run the production warning check again. It must exit `0` with exactly `{"ok":true,"warnings":[]}` before migration or restart:

```bash
cd "$API_DIR"
env -u DATABASE_URL -u CORS_ORIGIN -u JWT_SECRET -u PASSWORD_PEPPER \
  -u ALLOW_INSECURE_LOOPBACK_CORS \
  -u ADMIN_USERNAME -u ADMIN_PASSWORD -u TRUST_PROXY \
  NODE_ENV=production node --env-file=.env --input-type=module -e '
  import { getEnv, getSecurityWarnings } from "./src/config/env.js";
  const warnings = getSecurityWarnings(getEnv());
  console.log(JSON.stringify({ ok: warnings.length === 0, warnings }));
  process.exitCode = warnings.length === 0 ? 0 : 1;
'
export DATABASE_URL="$(env -u DATABASE_URL node --env-file=.env -e 'process.stdout.write(process.env.DATABASE_URL || "")')"
test -n "$DATABASE_URL"
unset CURRENT_DATABASE_URL NEW_DATABASE_URL NEW_DB_PASSWORD NEW_ADMIN_PASSWORD NEW_JWT_SECRET
```

Rotating `JWT_SECRET` invalidates existing sessions; all users must log in again after restart. Preserve `.env.before-$ROLLOUT_ID` as a protected rollback record and never print or commit either environment file.

### If configuration hardening fails

Keep PM2 stopped. Fix forward while stopped, or roll back the database password and `.env` together. Never start the API when the role password and `DATABASE_URL` differ.

For rollback, change the PostgreSQL role back through the same interactive flow, entering the previous password from the protected credential record, then restore and validate the previous environment:

```bash
docker exec -it "$POSTGRES_CONTAINER" \
  psql --no-psqlrc --username=postgres --dbname=postgres \
  --command='\password postgres'

cd "$API_DIR"
install -m 600 ".env.before-$ROLLOUT_ID" .env
export DATABASE_URL="$(env -u DATABASE_URL node --env-file=.env -e 'process.stdout.write(process.env.DATABASE_URL || "")')"
export ROLLBACK_PGUSER="$(node --env-file=.env -e 'process.stdout.write(decodeURIComponent(new URL(process.env.DATABASE_URL).username))')"
export ROLLBACK_PGPASSWORD="$(node --env-file=.env -e 'process.stdout.write(decodeURIComponent(new URL(process.env.DATABASE_URL).password))')"
export ROLLBACK_PGDATABASE="$(node --env-file=.env -e 'process.stdout.write(decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)))')"
docker exec -e PGPASSWORD="$ROLLBACK_PGPASSWORD" "$POSTGRES_CONTAINER" \
  psql --no-psqlrc --host=127.0.0.1 --username="$ROLLBACK_PGUSER" \
  --dbname="$ROLLBACK_PGDATABASE" --command='SELECT 1' >/dev/null
cd "$APP_DIR"
npm run admin:rotate-credentials --workspace @avia/api
pm2 start "$PM2_APP" --update-env
curl --fail --silent --show-error "$API_BASE_URL/health" \
  | jq -e '.ok == true and .service == "avia-api"'
unset ROLLBACK_PGUSER ROLLBACK_PGPASSWORD ROLLBACK_PGDATABASE
```

Expected: the previous database credentials authenticate, the dedicated updater restores the previous configured admin hash without touching business data, PM2 returns `online`, and health exits `0`. End the rollout after this rollback; investigate before trying again.

## 5. Inspect and reconcile migration `0007`

The observed integration database has `Item.archivedAt` while Prisma's ledger still reports `0007_item_archival` as pending. Running `migrate deploy` blindly could attempt the already-present DDL. First review the committed migration and record status:

```bash
sed -n '1,120p' "$API_DIR/prisma/migrations/0007_item_archival/migration.sql"
cd "$API_DIR"
npx prisma migrate status --schema prisma/schema.prisma
```

The migration must contain only the nullable `Item.archivedAt` addition and `Item_tenantId_branchId_archivedAt_createdAt_idx` creation. Connection errors, failed migrations, modified migration SQL, or unexpected pending migrations are blockers.

Run the read-only production preflight before changing migration history. Capture its exit code because unresolved access users may independently make the overall result nonzero:

```bash
cd "$APP_DIR"
npm run db:preflight:production --workspace @avia/api --silent \
  >"/tmp/preflight-before-0007-$ROLLOUT_ID.json"
export PREFLIGHT_BEFORE_0007_EXIT=$?
cat "/tmp/preflight-before-0007-$ROLLOUT_ID.json"
```

The preflight machine-checks the required table, `Item.archivedAt`, and the named archival index. Inspect the exact live column and index definitions as a second, independent check:

```bash
export PGPASSWORD="$(DATABASE_URL="$DATABASE_URL" node -e 'process.stdout.write(decodeURIComponent(new URL(process.env.DATABASE_URL).password))')"
docker exec -e PGPASSWORD="$PGPASSWORD" "$POSTGRES_CONTAINER" \
  psql --no-psqlrc --host=127.0.0.1 --username="$PGUSER" --dbname="$PGDATABASE" \
  --command="SELECT column_name, data_type, is_nullable, datetime_precision
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'Item'
               AND column_name = 'archivedAt';"
docker exec -e PGPASSWORD="$PGPASSWORD" "$POSTGRES_CONTAINER" \
  psql --no-psqlrc --host=127.0.0.1 --username="$PGUSER" --dbname="$PGDATABASE" \
  --command="SELECT index_table.relname AS index_name,
                    index_meta.indisvalid,
                    index_meta.indisready,
                    index_meta.indisunique,
                    access_method.amname AS method,
                    pg_get_indexdef(index_meta.indexrelid) AS definition,
                    pg_get_expr(index_meta.indpred, index_meta.indrelid) AS predicate
             FROM pg_index AS index_meta
             JOIN pg_class AS item_table ON item_table.oid = index_meta.indrelid
             JOIN pg_namespace AS item_schema ON item_schema.oid = item_table.relnamespace
             JOIN pg_class AS index_table ON index_table.oid = index_meta.indexrelid
             JOIN pg_am AS access_method ON access_method.oid = index_table.relam
             WHERE item_schema.nspname = 'public'
               AND item_table.relname = 'Item'
               AND index_table.relname = 'Item_tenantId_branchId_archivedAt_createdAt_idx';"
unset PGPASSWORD
```

An exact match means all of the following are true:

- `schema.inspectionOk` in the preflight JSON is `true`, `schema.error` is absent, and `schema.missing` is empty.
- The column query returns exactly one nullable `timestamp without time zone` column named `archivedAt` with precision `3`.
- The index query returns exactly one row with `indisvalid=true`, `indisready=true`, `indisunique=false`, method `btree`, columns `tenantId`, `branchId`, `archivedAt`, and `createdAt` in that order, and a null predicate.
- The definitions match the reviewed `0007_item_archival/migration.sql`; there are no partial or unrelated changes.

If migration status says `0007_item_archival` is pending and every check above matches exactly, require an explicit operator confirmation before reconciling the ledger:

```bash
jq -e '.schema.inspectionOk == true and (.schema.error | not) and .schema.missing == []' "/tmp/preflight-before-0007-$ROLLOUT_ID.json"
read -rp 'Type RESOLVE 0007 EXACT MATCH to confirm the schema matches migration 0007: ' RESOLVE_CONFIRMATION
test "$RESOLVE_CONFIRMATION" = 'RESOLVE 0007 EXACT MATCH'
cd "$API_DIR"
npx prisma migrate resolve --applied 0007_item_archival \
  --schema prisma/schema.prisma
```

Never run `migrate resolve` from the index name alone. A preflight inspection exception emits `schema.inspectionOk=false`, `schema.missing=null`, and `schema.error`; that result is always a blocker and cannot satisfy the command above. If the column or index is absent, partial, invalid, differently defined, or the SQL does not match, stop the rollout and investigate the drift separately. Do not run `migrate deploy` in that state. If status already reports `0007_item_archival` applied, skip `migrate resolve` but still require the exact schema checks.

After the resolve or already-applied decision, rerun migration status, SQL diff, and preflight:

```bash
cd "$API_DIR"
npx prisma migrate status --schema prisma/schema.prisma

cd "$APP_DIR"
export DIFF_FILE="/tmp/aviaoutdoor-$ROLLOUT_ID.sql"
(cd "$API_DIR" && npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script) >"$DIFF_FILE"
less "$DIFF_FILE"

npm run db:preflight:production --workspace @avia/api --silent \
  >"/tmp/preflight-after-0007-$ROLLOUT_ID.json"
export PREFLIGHT_AFTER_0007_EXIT=$?
cat "/tmp/preflight-after-0007-$ROLLOUT_ID.json"
jq -e '.schema.missing == []' "/tmp/preflight-after-0007-$ROLLOUT_ID.json"
```

Expected: migration status is up to date, the diff contains no executable DDL, and `schema.missing` is empty. Access blockers may still make `PREFLIGHT_AFTER_0007_EXIT` nonzero; they are handled in the next section. Only after these checks pass, run the no-pending migration gate and generate Prisma Client:

```bash
cd "$API_DIR"
npx prisma migrate deploy --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
```

## 6. Dry-run and apply access assignments

Run the access planner without writes and retain its JSON report:

```bash
cd "$APP_DIR"
npm run db:backfill:access --workspace @avia/api --silent \
  >"/tmp/access-dry-run-$ROLLOUT_ID.json"
cat "/tmp/access-dry-run-$ROLLOUT_ID.json"
```

Review every proposed assignment. `unresolved` must be empty. Resolve ambiguous tenants or branches, inactive memberships or tenants, missing active branch access, and branch access without membership before continuing.

Apply only the reviewed, unambiguous assignments:

```bash
npm run db:backfill:access --workspace @avia/api --silent -- --apply \
  >"/tmp/access-apply-$ROLLOUT_ID.json"
cat "/tmp/access-apply-$ROLLOUT_ID.json"
```

Run both read-only checks again:

```bash
npm run db:backfill:access --workspace @avia/api --silent \
  >"/tmp/access-recheck-$ROLLOUT_ID.json"
cat "/tmp/access-recheck-$ROLLOUT_ID.json"

npm run db:preflight:production --workspace @avia/api --silent \
  >"/tmp/production-preflight-$ROLLOUT_ID.json"
cat "/tmp/production-preflight-$ROLLOUT_ID.json"
```

Expected: the access recheck contains empty `assignments` and `unresolved` arrays. The production preflight exits `0` and contains `"ok":true`, `schema.inspectionOk:true`, no `schema.error`, an empty `schema.missing` array, `assignmentCount: 0`, and an empty `access.unresolved` array. The production preflight never writes data.

## 7. Restart and check health

```bash
pm2 restart "$PM2_APP" --update-env
pm2 describe "$PM2_APP"
curl --fail --silent --show-error "$API_BASE_URL/health" \
  | tee "/tmp/health-$ROLLOUT_ID.json" \
  | jq -e '.ok == true and .service == "avia-api"'
```

Expected: PM2 reports `online`, and the health assertion exits `0`.

## 8. Check admin and cashier login

Use known production smoke accounts. Password input is hidden and is not stored in shell history.

```bash
read -rp 'Admin username: ' ADMIN_USERNAME
read -rsp 'Admin password: ' ADMIN_PASSWORD; printf '\n'
ADMIN_LOGIN="$(curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  --data "$(jq -nc --arg username "$ADMIN_USERNAME" --arg password "$ADMIN_PASSWORD" \
    '{username:$username,password:$password}')" \
  "$API_BASE_URL/api/auth/login")"
ADMIN_TOKEN="$(printf '%s' "$ADMIN_LOGIN" | jq -er '.data.token')"

read -rp 'Cashier username: ' CASHIER_USERNAME
read -rsp 'Cashier password: ' CASHIER_PASSWORD; printf '\n'
CASHIER_LOGIN="$(curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  --data "$(jq -nc --arg username "$CASHIER_USERNAME" --arg password "$CASHIER_PASSWORD" \
    '{username:$username,password:$password}')" \
  "$API_BASE_URL/api/auth/login")"
CASHIER_TOKEN="$(printf '%s' "$CASHIER_LOGIN" | jq -er '.data.token')"
unset ADMIN_PASSWORD CASHIER_PASSWORD ADMIN_LOGIN CASHIER_LOGIN
```

Expected: both token extractions exit `0`. Stop on HTTP `401`, `403`, or `429`; do not repeatedly retry credentials after a failure.

Verify the cashier can read only the assigned smoke tenant and branch:

```bash
export SMOKE_TENANT_ID=<cashier-tenant-id>
export SMOKE_BRANCH_ID=<cashier-branch-id>
curl --fail --silent --show-error \
  -H "authorization: Bearer $CASHIER_TOKEN" \
  -H "x-tenant-id: $SMOKE_TENANT_ID" \
  -H "x-branch-id: $SMOKE_BRANCH_ID" \
  "$API_BASE_URL/api/items" | jq -e '.ok == true'
```

## 9. Archive and restore one smoke item

Choose a disposable active item in the smoke branch that is not being used by cashiers. This smoke test restores the item to active state but intentionally leaves archive/restore audit records.

```bash
export SMOKE_ITEM_ID=<disposable-active-item-id>

curl --fail --silent --show-error -X DELETE \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "x-tenant-id: $SMOKE_TENANT_ID" \
  -H "x-branch-id: $SMOKE_BRANCH_ID" \
  "$API_BASE_URL/api/items/$SMOKE_ITEM_ID" \
  | tee "/tmp/archive-smoke-$ROLLOUT_ID.json" \
  | jq -e '.ok == true and (.data.archivedAt != null)'

curl --fail --silent --show-error -X POST \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "x-tenant-id: $SMOKE_TENANT_ID" \
  -H "x-branch-id: $SMOKE_BRANCH_ID" \
  "$API_BASE_URL/api/items/$SMOKE_ITEM_ID/restore" \
  | tee "/tmp/restore-smoke-$ROLLOUT_ID.json" \
  | jq -e '.ok == true and .data.archivedAt == null'
```

Expected: both assertions exit `0`; the first response has an archive timestamp and the second returns `archivedAt: null`.

## 10. Review PM2 logs

```bash
pm2 logs "$PM2_APP" --lines 200 --nostream \
  | tee "/tmp/pm2-$ROLLOUT_ID.log"
pm2 describe "$PM2_APP"
```

Expected: the process remains `online`, restart count is stable after the planned restart, and logs contain no startup, Prisma, unhandled rejection, authorization, archive, or restore errors. Keep the backup and rollout reports until the release retention window expires.

## Rollback

Rollback the application when health, login, archive/restore, or log checks fail. Do not reverse migration `0007_item_archival`: `Item.archivedAt` is nullable and additive, so the previous application ignores it safely. The access assignments are also compatible with the previous application and do not require data rollback.

```bash
cd "$APP_DIR"
git checkout --detach "$PREVIOUS_COMMIT"
npm ci
cd "$API_DIR"
npx prisma generate --schema prisma/schema.prisma
cd "$APP_DIR"
pm2 restart "$PM2_APP" --update-env
pm2 describe "$PM2_APP"
curl --fail --silent --show-error "$API_BASE_URL/health" \
  | jq -e '.ok == true and .service == "avia-api"'
pm2 logs "$PM2_APP" --lines 200 --nostream
```

Expected: PM2 reports `online`, health exits `0`, and the previous application login flow works. Preserve `$BACKUP_FILE`; restore it only under a separate incident plan when database corruption or an unrelated destructive change is confirmed. Do not restore the dump merely to remove the nullable archival column.
