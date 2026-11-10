import '@testing-library/jest-dom/vitest'

// jsdom не реалізує matchMedia. Заглушка відповідає «звичайний десктопний
// браузер»: жоден media-запит не збігається. Тести, яким треба інше, підміняють її.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) satisfies MediaQueryList
}
