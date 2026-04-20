import "@testing-library/jest-dom/vitest"

// jsdom does not implement IntersectionObserver — stub it for tests that render
// components using scroll-spy / section highlighting (e.g. NewVersionForm).
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  value: IntersectionObserverStub,
})

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
