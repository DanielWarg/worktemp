# Security Policy

## Secret Handling Rules

- Never commit real secrets to git.
- Never commit local `.env` files, private keys, certificates with embedded private keys, or credential helper files.
- Only values that are safe to expose in the browser may use the `NEXT_PUBLIC_` prefix.
- Tokens, passwords, API secrets, private keys, database credentials and storage credentials must stay server-side only.

## Frontend vs Backend

### Safe for frontend
- Public base URLs
- Public feature flags
- Public analytics identifiers
- Public, non-sensitive third-party keys intended for browser use

### Never expose to frontend
- `NEXTAUTH_SECRET`
- `DATABASE_URL`
- S3 access keys
- Vercel tokens
- OAuth client secrets
- Any token that grants write access or reads private data

## GitHub and CI/CD

- GitHub Actions is configured to fail builds when common secret patterns or forbidden files are committed.
- Production and preview deployments expect secrets to come from GitHub repository or environment secrets, not from committed files.
- Protect `main` with required checks and pull requests only.

## Required GitHub Secrets

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Store production deployment credentials in the `production` environment when possible.

## Rotation Procedure

If a secret is exposed:

1. Revoke or rotate it immediately at the provider.
2. Remove the leaked value from the codebase and git history if necessary.
3. Replace the secret in GitHub/Vercel settings.
4. Review logs and recent deployments for misuse.
5. Document the incident in `STATUS.md` if it affects delivery or operations.
