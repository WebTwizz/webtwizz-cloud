/** Cookie names visitors see; the sign-in service keeps its own names on the other side of the site's server. */
export const OURS = '__Secure-webtwizz-auth.';
export const THEIRS = '__Secure-neon-auth.';

export const toTheirs = (name: string): string => (name.startsWith(OURS) ? THEIRS + name.slice(OURS.length) : name);
export const toOurs = (name: string): string => (name.startsWith(THEIRS) ? OURS + name.slice(THEIRS.length) : name);

export function cookieHeaderToTheirs(header: string | null): string | null {
  if (!header || !header.includes(OURS)) return header;
  return header
    .split(/;\s*/)
    .map((pair) => {
      const at = pair.indexOf('=');
      return at < 0 ? pair : toTheirs(pair.slice(0, at)) + pair.slice(at);
    })
    .join('; ');
}

export function setCookieToOurs(value: string): string {
  const at = value.indexOf('=');
  return at < 0 ? value : toOurs(value.slice(0, at)) + value.slice(at);
}
