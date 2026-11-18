import '@testing-library/jest-dom/vitest';

// Node 25+ ships its own Web Storage globals. Without --localstorage-file they are not usable,
// and they hide jsdom's localStorage/sessionStorage (reading them can even throw), so the tests
// always use jsdom's storage. Node's getter is replaced without being read.
const jsdomWindow = globalThis.jsdom?.window;
for (const name of ['localStorage', 'sessionStorage']) {
  if (jsdomWindow?.[name]) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: jsdomWindow[name] });
  }
}
