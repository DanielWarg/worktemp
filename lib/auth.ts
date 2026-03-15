// MVP demo auth: returns a fixed demo account ID.
// Replace with NextAuth.js or similar when adding real auth.

export const DEMO_ACCOUNT_ID = "demo-account-001";

export function getSessionAccountId(): string {
  return DEMO_ACCOUNT_ID;
}
