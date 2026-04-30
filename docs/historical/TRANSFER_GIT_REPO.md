# Transferring This Repository to Another GitHub Organization

Step-by-step guide for transferring this monorepo between GitHub organizations. Applicable to any repo with Vercel deployments, AWS OIDC, GitHub Actions, and third-party integrations.

---

## Prerequisites

- Admin access on the **source** GitHub org/account
- Owner or admin access on the **target** GitHub org
- Admin access on Vercel, AWS, Clerk, and Stripe dashboards
- No in-flight PRs or active deployments during transfer

---

## Phase 1: Transfer the Repository

### 1.1 Transfer on GitHub

1. Go to the repo on GitHub
2. **Settings** → **General** → scroll to **Danger Zone**
3. Click **Transfer repository**
4. Enter the target organization name
5. Type the repo name to confirm
6. Complete the transfer

**What GitHub preserves:** All commits, branches, tags, releases, issues, PRs, wiki, stars, watchers. GitHub automatically creates a redirect from the old URL — existing clones will continue to work temporarily.

**What GitHub does NOT preserve:** GitHub Pages settings, deploy keys (re-add manually), webhook URLs (transferred but verify), GitHub Apps installations (may need re-authorization).

### 1.2 Update local remote

```bash
git remote set-url origin https://github.com/<new-org>/<repo-name>.git
git remote -v          # verify
git fetch origin       # confirm connectivity
```

### 1.3 Update all developer machines

Every developer with a local clone runs the same `git remote set-url` command. No re-clone needed.

---

## Phase 2: Fix CI/CD — GitHub Actions

### 2.1 Verify secrets and variables

Go to the new repo → **Settings** → **Secrets and variables** → **Actions**.

Secrets and variables transfer with the repo. Verify these exist:

| Type | Name | Purpose |
|---|---|---|
| Secret | `AWS_ROLE_ARN` | OIDC role for CI deployments |
| Variable | `AWS_ACCOUNT_ID` | AWS account number |
| Variable | `AWS_REGION` | e.g., `ap-south-1` |

If the repo uses **GitHub Environments** (e.g., `production`, `staging`), verify environment-specific secrets are intact under **Settings** → **Environments**.

### 2.2 Test CI

Push a trivial commit or re-run an existing workflow to verify Actions still work.

```bash
git commit --allow-empty -m "test: verify CI after repo transfer"
git push origin main
```

Check the **Actions** tab — the CI workflow should trigger and pass.

---

## Phase 3: Fix AWS OIDC Trust Policy

If the repo uses GitHub Actions OIDC to assume an AWS role (this repo does), the IAM role's trust policy references the old org/repo path.

### 3.1 Update the trust policy

1. Open **AWS IAM** → **Roles** → find the role (e.g., `renewable-energy-github-actions`)
2. Edit the **Trust policy**
3. Find the condition:
   ```json
   "StringLike": {
     "token.actions.githubusercontent.com:sub": "repo:<old-org>/<repo-name>:*"
   }
   ```
4. Change to:
   ```json
   "StringLike": {
     "token.actions.githubusercontent.com:sub": "repo:<new-org>/<repo-name>:*"
   }
   ```
5. Save

### 3.2 Verify

Trigger a workflow that uses OIDC (e.g., the deploy workflow). It should assume the role successfully.

**If you skip this step:** Any workflow using `aws-actions/configure-aws-credentials` with OIDC will fail with `Not authorized to perform sts:AssumeRoleWithWebIdentity`.

---

## Phase 4: Fix Vercel Deployments

### 4.1 Understand the impact

Vercel links projects to a specific GitHub repo via the **Git Integration**. After transfer:
- Vercel may detect the repo move automatically (same Git URL redirect)
- Or it may lose the connection and stop deploying

### 4.2 Re-link if needed

For each Vercel project linked to this repo:

1. Go to **Vercel Dashboard** → select the project
2. **Settings** → **Git**
3. If the connected repo shows the old org, click **Disconnect**
4. Click **Connect Git Repository** → select the repo from the new org
5. Verify the branch (usually `main`) and root directory are correct

### 4.3 Verify auto-deploy

Push a commit and confirm Vercel triggers a deployment for each linked project.

**Projects in this repo:**

| Vercel Project | Root Directory |
|---|---|
| web | `apps/web` |
| mvp_web | `apps/mvp_web` |
| api | `apps/api` |
| mvp_api | `apps/mvp_api` |
| mvp_admin | `apps/mvp_admin` |

### 4.4 Check environment variables

Vercel environment variables are stored per-project, not per-repo. They survive the transfer. But verify:

1. Go to each project → **Settings** → **Environment Variables**
2. Confirm all variables are present (especially `DATABASE_URL`, `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, etc.)

---

## Phase 5: Fix Third-Party Integrations

### 5.1 Clerk

- **Webhooks:** If Clerk webhooks point to a Vercel preview URL that includes the old repo name, update them. Production custom domains are unaffected.
- **API Keys:** Stored in Vercel env vars — no change needed if Vercel env vars are intact.

### 5.2 Stripe

- **Webhooks:** Stripe webhooks point to your API domain (e.g., `api.solarlayout.in/webhooks/stripe`). These use custom domains, not GitHub URLs. No change needed.
- **API Keys:** Stored in Vercel env vars. No change needed.

### 5.3 AWS S3 / Lambda

- **S3 CORS policies:** Reference domain names (`solarlayout.in`, `staging.solarlayout.in`), not GitHub URLs. No change needed.
- **Lambda:** Uses ECR image URIs and IAM roles. The only GitHub reference is the OIDC trust policy (fixed in Phase 3).
- **IAM policies:** S3/Lambda IAM policies reference bucket ARNs and resource ARNs, not GitHub. No change needed.

---

## Phase 6: Update Documentation

### 6.1 In-repo references

Search for old org name in the codebase:

```bash
grep -r "<old-org>" . --include="*.md" --include="*.yml" --include="*.yaml" --include="*.json" -l
```

Common places:
- `CLAUDE.md` — if it references GitHub URLs
- `.github/workflows/*.yml` — comments or hardcoded references
- `package.json` — `repository` field
- `README.md` — badges, links
- `docs/` — architecture docs, setup guides

### 6.2 External references

- Update any external wikis, Notion docs, or Slack bookmarks
- Update any npm/package registry references (if publishing packages)
- Update any monitoring/alerting tools that reference the repo

---

## Verification Checklist

Run through this after transfer:

- [ ] `git remote -v` shows new org URL on all developer machines
- [ ] `git fetch origin` succeeds
- [ ] `git push` works
- [ ] GitHub Actions CI triggers on push to main
- [ ] GitHub Actions CI passes (lint, typecheck, test, build)
- [ ] AWS OIDC workflows succeed (deploy, release)
- [ ] Vercel deploys trigger on push to main
- [ ] Vercel preview deployments work on PRs
- [ ] Production sites are live and functional
- [ ] Stripe webhooks still fire (make a test purchase or check Stripe dashboard → Webhooks → Recent deliveries)
- [ ] Clerk auth works (sign in, sign up)
- [ ] S3 presigned URLs work (test a download)

---

## Troubleshooting

### GitHub Actions fails with "Resource not accessible by integration"

The GitHub App (if any) or GitHub Actions permissions need re-authorization on the new org. Go to the org's **Settings** → **GitHub Apps** or **Actions** → **General** and verify permissions.

### Vercel shows "No Git repository connected"

The Vercel-GitHub integration lost the connection. Re-connect:
1. Vercel project → Settings → Git → Disconnect
2. Reconnect to the repo in the new org
3. You may need to install the Vercel GitHub App on the new org first: **Vercel Dashboard** → **Settings** → **Git Integration**

### AWS OIDC fails with "Not authorized to perform sts:AssumeRoleWithWebIdentity"

The IAM role trust policy still references the old org. Update the `Condition` in the trust policy (see Phase 3).

### Old GitHub URL still works

GitHub maintains redirects from the old URL for a period after transfer. This is normal. But update all references — the redirect will eventually expire, and it breaks if someone creates a new repo with the old name in the old org.

### Clerk webhooks return 404

If webhooks pointed to a Vercel preview URL like `<old-repo>-<hash>.vercel.app`, that URL no longer exists. Update to the production custom domain or the new Vercel preview URL pattern.

### npm install fails with "Could not resolve dependency"

If `package.json` has `"repository"` field or any dependency references the old GitHub URL (e.g., `github:<old-org>/<repo>`), update those references.

---

## Repeating for Multiple Repos

This process is identical for every repo. To batch:

1. Transfer all repos on GitHub first
2. Update all local remotes:
   ```bash
   for repo in repo1 repo2 repo3; do
     cd /path/to/$repo
     git remote set-url origin https://github.com/<new-org>/$repo.git
     cd ..
   done
   ```
3. Update AWS OIDC trust policies — if multiple repos share one IAM role, update the condition to allow all new org repos:
   ```json
   "StringLike": {
     "token.actions.githubusercontent.com:sub": "repo:<new-org>/*:*"
   }
   ```
4. Re-link Vercel projects one by one
5. Run the verification checklist for each repo
