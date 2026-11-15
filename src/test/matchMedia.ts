/**
 * jsdom has no `matchMedia`; this stub lets tests drive the OS colour-scheme
 * and reduced-motion preferences and emit live change events, which the theme
 * controller and `usePrefersReducedMotion` listen to.
 */

type ChangeListener = (event: MediaQueryListEvent) => void;
type QueryKind = "reduced-motion" | "dark" | "other";

/** Listeners per preference, so a colour-scheme change never wakes a motion subscriber. */
const listeners = new Map<QueryKind, Set<ChangeListener>>();
let prefersDark = false;
let prefersReducedMotion = false;

function kindOf(query: string): QueryKind {
  if (query.includes("reduced-motion")) return "reduced-motion";
  if (query.includes("dark")) return "dark";
  return "other";
}

function listenersOf(kind: QueryKind): Set<ChangeListener> {
  let set = listeners.get(kind);
  if (set === undefined) {
    set = new Set();
    listeners.set(kind, set);
  }
  return set;
}

function notify(kind: QueryKind, matches: boolean): void {
  for (const listener of listenersOf(kind)) {
    listener({ matches } as MediaQueryListEvent);
  }
}

export function installMatchMedia(): void {
  listeners.clear();
  prefersDark = false;
  prefersReducedMotion = false;

  window.matchMedia = ((query: string) => {
    const kind = kindOf(query);
    return {
      media: query,
      matches: kind === "reduced-motion" ? prefersReducedMotion : kind === "dark" ? prefersDark : false,
      onchange: null,
      addEventListener: (_type: string, listener: ChangeListener) => listenersOf(kind).add(listener),
      removeEventListener: (_type: string, listener: ChangeListener) => listenersOf(kind).delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

/** Sets the simulated OS colour-scheme preference and notifies its subscribers. */
export function setPrefersDark(value: boolean): void {
  prefersDark = value;
  notify("dark", value);
}

/** Sets the simulated OS reduced-motion preference and notifies its subscribers. */
export function setPrefersReducedMotion(value: boolean): void {
  prefersReducedMotion = value;
  notify("reduced-motion", value);
}
