## Summary

- What changed?
- Why was it needed?

## Checks

- [ ] No secrets, keys, tokens or `.env` files were committed
- [ ] Any browser-exposed env var uses `NEXT_PUBLIC_` and is safe to publish
- [ ] Any server-only env var is only consumed on the server side
- [ ] `STATUS.md` was updated if the change affects architecture, workflow or delivery state
- [ ] CI passes locally or in GitHub Actions

## Risk Review

- [ ] Auth/session impact reviewed
- [ ] Database/schema impact reviewed
- [ ] Frontend exposure risk reviewed
- [ ] Backend secret handling reviewed
