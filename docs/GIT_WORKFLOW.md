# Git Workflow

## Branch Strategy

- `main` is the protected production branch.
- All work happens in short-lived branches from `main`.
- Branch naming:
  - `feature/<short-name>`
  - `fix/<short-name>`
  - `chore/<short-name>`

## Merge Strategy

- Open a pull request for every change.
- Use squash merge to keep history compact.
- Do not push directly to `main` outside emergency maintenance.

## Required Checks

- `repo-hygiene`
- `node-ci`

These checks block merges when secrets, forbidden files or failing build/test steps are detected.

## Deployment Flow

- Pull request updates trigger CI and a preview deployment when the app exists and Vercel secrets are configured.
- Merges to `main` trigger the production deployment workflow.
- Deployment workflows intentionally skip while the repo has no `package.json`.

## Secret Rules

- Never store secrets in source files.
- Never create `NEXT_PUBLIC_` variables for sensitive values.
- Keep deploy credentials in GitHub Secrets or Environment Secrets.

## Handoff Rule

- Update `STATUS.md` whenever workflow, deployment setup or security posture changes in a way a new agent needs to know.
