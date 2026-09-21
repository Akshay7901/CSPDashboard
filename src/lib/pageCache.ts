// Tiny in-memory cache so navigating back to a list or detail page you've
// already loaded this session shows the previous result instantly instead
// of blanking out while a fresh copy is fetched. Lives only as long as the
// SPA stays loaded (a full page reload clears it) — that's fine, since a
// hard reload is expected to hit the network anyway. Callers still kick off
// a normal fetch after reading the cache; this only avoids the empty/loading
// flash on revisits, it never replaces revalidation.
const cache = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  cache.set(key, value);
}
