# Cloudflare Provisioner Smoke Test

Manual pre-release checklist for `scripts/deploy-cloudflare.sh`. Run
against a throwaway Cloudflare account (or a personal test account) so
you can freely destroy the deployment afterward.

## Prerequisites

- `wrangler login` completed on the test account
- Clean checkout of the branch to test
- No `.cloudflare.env` file in the repo root

## 1. Fresh init

```bash
./scripts/deploy-cloudflare.sh init \
  --admin-handle smoke \
  --admin-password "$(openssl rand -base64 24)"
```

Verify:

- [ ] Script prints `Mostly deployed successfully.` at the end
- [ ] URL printed matches `https://mostly.*.workers.dev`
- [ ] API key printed starts with `msk_`
- [ ] Agent token printed starts with `mat_`
- [ ] `.cloudflare.env` was created and contains `DATABASE_ID=`,
      `WORKSPACE_ID=`, `WORKER_URL=`
- [ ] Opening the URL in a browser shows the Mostly web UI (not the
      SetupScreen) — the single-origin build flag is working
- [ ] `curl -H "Authorization: Bearer <msk_key>" <url>/v0/principals`
      returns JSON with the admin principal
- [ ] `wrangler tail` during the curl call shows the API request hitting
      the worker

## 2. Update

Make a trivial code change (e.g., touch a comment in `packages/server/src/app.ts`),
then:

```bash
./scripts/deploy-cloudflare.sh update
```

Verify:

- [ ] Script prints `Mostly updated.` at the end
- [ ] Output does NOT include any `register` or `api-keys` calls
- [ ] `.cloudflare.env` is unchanged (`git status` on a fresh clone
      would show it the same as after `init`)
- [ ] Opening the URL still shows the web UI, and the admin can still
      log in with the same API key
- [ ] Re-running `./scripts/deploy-cloudflare.sh update` a second time
      in a row prints the same success output (idempotent)

## 3. Destroy

```bash
./scripts/deploy-cloudflare.sh destroy --yes-i-really-mean-it
```

Enter `mostly` at the confirmation prompt.

Verify:

- [ ] Script prints `Mostly destroyed.` at the end
- [ ] `.cloudflare.env` no longer exists
- [ ] `git diff wrangler.toml` is empty (placeholders reset)
- [ ] The deployed URL returns `Worker not found` or similar
- [ ] `wrangler d1 list` no longer contains `mostly-db`

## 4. Negative tests

- [ ] Run `init` while `.cloudflare.env` exists → exits 1 with
      "already initialized"
- [ ] Run `update` while `.cloudflare.env` is missing → exits 1 with
      "not initialized"
- [ ] Run `destroy` without `--yes-i-really-mean-it` → exits 1 with a
      "re-run with" message
- [ ] Run `destroy --yes-i-really-mean-it` and type the wrong worker
      name → exits 0 with "aborted." and state is untouched
