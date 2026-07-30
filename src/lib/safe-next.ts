/**
 * Sanitise a `?next=` destination taken from the URL.
 *
 * `proxy.ts` appends `?next=` when it bounces a signed-out request, so the value
 * arrives straight from the address bar and is redeemed with a real navigation
 * once sign-in completes. Anything that is not a plain in-app path is dropped:
 * browsers read both `//evil.com` and `/\evil.com` as protocol-relative URLs, so
 * a `startsWith("/")` check alone turns the login flow into an open redirect —
 * a signed-in partner lands on somebody else's site.
 *
 * This lived inline in login/page.tsx, correct and commented, while
 * auth/callback/page.tsx did its own `startsWith("/")` test and had the bug the
 * comment next door described. One implementation, both entrances.
 */
export function safeNext(value: string | undefined | null): string {
  if (!value?.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
