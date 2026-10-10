import { cookies as nextCookies, headers as nextHeaders } from 'next/headers';
import { cookieHeaderToTheirs, toOurs } from './cookies';

type Store = Record<PropertyKey, unknown>;

function delegate<T extends object>(target: T, overrides: Record<string, unknown>): T {
  return new Proxy(target, {
    get(store, key) {
      if (typeof key === 'string' && key in overrides) return overrides[key];
      const value = Reflect.get(store, key, store);
      return typeof value === 'function' ? value.bind(store) : value;
    },
  });
}

export async function headers() {
  const store = await nextHeaders();
  return delegate(store, {
    get: (name: string) => (name.toLowerCase() === 'cookie' ? cookieHeaderToTheirs(store.get(name)) : store.get(name)),
  });
}

export async function cookies() {
  const store = await nextCookies();
  const rename = (args: unknown[]) => {
    const [first, ...rest] = args;
    if (typeof first === 'string') return [toOurs(first), ...rest];
    if (first && typeof first === 'object' && 'name' in first) return [{ ...(first as Store), name: toOurs(String((first as Store).name)) }, ...rest];
    return args;
  };
  return delegate(store, {
    set: (...args: unknown[]) => (store.set as (...a: unknown[]) => unknown)(...rename(args)),
    delete: (...args: unknown[]) => (store.delete as (...a: unknown[]) => unknown)(...rename(args)),
  });
}
