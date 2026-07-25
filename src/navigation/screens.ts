/**
 * Client-side navigation targets.
 *
 * The shell is hub-and-spoke: the home hub opens one feature screen at a time
 * and returns. Screens are switched in React state — the WebView never reloads.
 */
export type ScreenId = "home" | "match" | "convert" | "settings";
