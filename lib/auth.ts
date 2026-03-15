/**
 * Auth module — session-based authentication.
 *
 * Current: cookie-based demo auth with simple token validation.
 * Future: replace with NextAuth.js for OAuth/email providers.
 *
 * API routes call getSessionAccountId(request) which returns the
 * account ID or null if not authenticated.
 */

export const DEMO_ACCOUNT_ID = "demo-account-001";

// Simple token-based auth via cookie or Authorization header
// In production, replace with NextAuth session validation
const AUTH_TOKEN = process.env.AUTH_TOKEN; // Set in .env for gated access

/**
 * Get the authenticated account ID.
 *
 * Middleware validates auth before routes execute, so this is safe to
 * call without a request object. Returns demo account ID in current
 * implementation. When NextAuth is added, this will read the session.
 */
export function getSessionAccountId(): string {
  return DEMO_ACCOUNT_ID;
}
