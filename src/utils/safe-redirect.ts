const BASE_ORIGIN = "http://localhost";

/**
 * Guard the `redirect` query parameter used after authentication.
 *
 * Only same-origin absolute paths are allowed. Absolute URLs, protocol-relative
 * URLs (`//evil.example`), backslash tricks (`/\evil.example`), `javascript:`
 * and control characters all fall back to `fallback`, which callers derive
 * from the authenticated user (org home or welcome).
 *
 * @param value - the raw `redirect` query parameter
 * @param fallback - the destination to use when `value` is not a safe path
 * @returns a path on this origin, or `fallback`
 */
export function safeRedirect(
  value: string | null | undefined,
  fallback: string
): string {
  if (!value) return fallback;

  // Must be an absolute path, not a URL. A second leading slash makes it
  // protocol-relative, and "/\" is normalised to "//" by browsers.
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.startsWith("/\\")) return fallback;

  // Control characters are never part of a path we generate.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  try {
    const resolved = new URL(value, BASE_ORIGIN);
    if (resolved.origin !== BASE_ORIGIN) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Append the `coworkerId` parameter to a destination produced by
 * {@link safeRedirect} without breaking an existing query string or hash.
 */
export function withCoworkerId(destination: string, coworkerId: string): string {
  const url = new URL(destination, BASE_ORIGIN);
  url.searchParams.set("coworkerId", coworkerId);
  return `${url.pathname}${url.search}${url.hash}`;
}
