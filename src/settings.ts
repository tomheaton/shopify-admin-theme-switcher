/** Settings shared by the service worker and the options page. */

export type Mode = "light" | "dark" | "system";

export const MODES: readonly Mode[] = ["light", "dark", "system"];

export const DEFAULT_MODE: Mode = "dark";

export const LABELS: Record<Mode, string> = { light: "Light", dark: "Dark", system: "Auto" };

export const ADMIN_MATCH = "https://admin.shopify.com/*";

/**
 * Embedded apps are served from each app developer's own host, so theming all of them needs access
 * to any site. The content script only acts in frames whose top-level page is the admin.
 */
export const ALL_SITES_MATCH = "https://*/*";
export const ALL_APPS_PERMISSION = { origins: [ALL_SITES_MATCH] };

export function isMode(value: unknown): value is Mode {
  return MODES.includes(value as Mode);
}

export async function readMode(): Promise<Mode> {
  const { mode } = await chrome.storage.local.get("mode");
  return isMode(mode) ? mode : DEFAULT_MODE;
}

export async function writeMode(mode: Mode): Promise<void> {
  await chrome.storage.local.set({ mode });
}

export function nextMode(mode: Mode): Mode {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}

/**
 * The match patterns, besides the admin, that the extension may run on: every site once access to
 * all apps is granted, or only the app hosts added on the options page.
 */
export async function embeddedAppOrigins(): Promise<string[]> {
  const { origins = [] } = await chrome.permissions.getAll();
  return origins.filter((origin) => origin !== ADMIN_MATCH);
}

/**
 * Turns an app's address as someone might type it, a host or a URL, into a match pattern for that
 * host, or null when it isn't an HTTPS host other than the admin.
 */
export function appHostPattern(input: string): string | null {
  const text = input.trim();
  if (!text) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(text.includes("://") ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname === "admin.shopify.com") {
    return null;
  }
  return `https://${url.hostname}/*`;
}
