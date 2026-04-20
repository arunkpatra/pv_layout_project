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

// jsdom does not implement ResizeObserver — stub it for tests that render
// Radix UI components (e.g. Switch) that use @radix-ui/react-use-size.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverStub,
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
