// Runs before any test file's module graph loads (registered via
// test.setupFiles) — the environment is plain Node, but authStore's zustand
// `persist` middleware calls localStorage on every state change. A static
// `import` inside a test file hoists above any inline polyfill, so this has
// to live in a real setup file to actually run first.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
}
