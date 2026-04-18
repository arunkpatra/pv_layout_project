import "@testing-library/jest-dom/vitest"

// jsdom does not implement matchMedia — stub it for tests that render
// components using the useMobile hook (e.g. SidebarProvider).
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
