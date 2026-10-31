import '@testing-library/jest-dom/vitest';

// jsdom has no CSS.escape; element ids need no escaping in these fixtures.
if (typeof globalThis.CSS === 'undefined') {
  Object.defineProperty(globalThis, 'CSS', { value: { escape: (value: string) => value } });
}

// jsdom has no layout, and its window.scrollTo only logs a "not implemented" error.
window.scrollTo = () => {};
