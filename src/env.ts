export function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. WebTwizz sets it on sites that have WebTwizz Cloud (Settings > Cloud).`);
  }
  return value;
}
