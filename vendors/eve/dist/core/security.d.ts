/**
 * Operational safety helpers (P1.12).
 *
 * EVE drives arbitrary URLs in real browsers, spawns MCP stdio commands, and
 * writes report files — all user-authorized operations, none safe-by-default
 * for untrusted inputs. These helpers make the trust boundary explicit and
 * fix the concrete, low-cost issues:
 *
 * - report/output paths: fixed filenames joined under a resolved output dir
 *   (no URL/title-derived segments), so traversal via page content is
 *   impossible;
 * - navigation: optional host allowlist enforced on session-initiated
 *   navigations (`assertUrlAllowed`);
 * - MCP stdio: documented execute-with-user-authorized-code semantics (see
 *   `connectMcpServer`); no shell is ever used for tokenization.
 */
/** Join fixed filenames under `dir`, resolving against traversal. */
export declare function safeJoin(dir: string, ...segments: string[]): string;
/** Strip directory components and unsafe chars from a dynamic filename. */
export declare function sanitizeFilename(name: string, fallback?: string): string;
/**
 * Enforce an optional host allowlist. Only http(s) URLs are checked —
 * anything else (mock:, about:, data:) is an offline fixture or an internal
 * page, not a network navigation. Absent/empty allowlist = no restriction
 * (backwards compat); present = http(s) navigation outside it throws.
 *
 * Matching is domain-and-subdomains (CSP-style): `example.com` covers
 * `app.example.com` but never `example.com.evil.com` (dot boundary or
 * full equality required). This is a deliberate policy choice, documented
 * in docs/security.md — not an exact-match oversight.
 */
export declare function assertUrlAllowed(url: string, allowlist?: readonly string[]): void;
//# sourceMappingURL=security.d.ts.map