/**
 * jsdom has no `matchMedia`; this stub lets tests drive the OS colour-scheme
 * preference and emit live change events, which the theme controller listens to.
 */

type ChangeListener = (event: MediaQueryListEvent) => void;

const listeners = new Set<ChangeListener>();
let prefersDark = false;

export function installMatchMedia(): void {
  listeners.clear();
  prefersDark = false;

  window.matchMedia = ((query: string) =>
    ({
      media: query,
      matches: query.includes("dark") ? prefersDark : false,
      onchange: null,
      addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: ChangeListener) => listeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

/** Sets the simulated OS preference and notifies subscribers. */
export function setPrefersDark(value: boolean): void {
  prefersDark = value;
  for (const listener of listeners) {
    listener({ matches: value } as MediaQueryListEvent);
  }
}
