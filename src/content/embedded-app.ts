// Runs in the page's own context in every frame on the app hosts the extension may access, before
// the app's scripts load, and themes apps built with Polaris web components when they're embedded
// in the admin.
//
// Polaris components ask for their theme with a `context-request` event keyed on a global symbol.
// Answering it first (a capturing listener on window runs before Polaris's own provider on <html>)
// hands every component the chosen scheme, and the class switches the design tokens to the dark set.
import type { Mode } from "../settings";

interface ThemeValue {
  theme: "admin-next";
  colorScheme: "light" | "dark";
  platform: "web";
  themeStyleTagId: string;
  overrides: undefined;
}

type ThemeCallback = (value: ThemeValue, unsubscribe: () => void) => void;

interface ContextRequestEvent extends Event {
  context?: unknown;
  callback: ThemeCallback;
  subscribe?: boolean;
}

const ADMIN_ORIGIN = "https://admin.shopify.com";
const THEME_CONTEXT = Symbol.for("internal-theme-provider");
const DARK_CLASS = "p-partial-theme-admin-next-dark";

/** Whether the frame's top-level page is the admin. */
function isEmbeddedInAdmin(): boolean {
  const ancestors = Array.from(location.ancestorOrigins);
  return window.top !== window && ancestors.at(-1) === ADMIN_ORIGIN;
}

function themeApp(mode: Mode): void {
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const themeValue = (): ThemeValue => {
    const dark = mode === "system" ? darkQuery.matches : mode === "dark";
    return {
      theme: "admin-next",
      colorScheme: dark ? "dark" : "light",
      platform: "web",
      themeStyleTagId: "",
      overrides: undefined,
    };
  };

  let value = themeValue();
  // Components that subscribed, so a system change can reach the ones already on the page
  const subscribers = new Set<ThemeCallback>();

  window.addEventListener(
    "context-request",
    (event) => {
      const request = event as ContextRequestEvent;
      if (request.context !== THEME_CONTEXT) {
        return;
      }
      request.stopImmediatePropagation();
      const { callback } = request;
      if (request.subscribe) {
        subscribers.add(callback);
        callback(value, () => subscribers.delete(callback));
      } else {
        callback(value, () => undefined);
      }
    },
    true,
  );

  // Hydration or the app's own colour scheme code may rewrite the class list, so keep it in step
  const root = document.documentElement;
  const syncClass = (): void => {
    const dark = value.colorScheme === "dark";
    if (root.classList.contains(DARK_CLASS) !== dark) {
      root.classList.toggle(DARK_CLASS, dark);
    }
  };
  new MutationObserver(syncClass).observe(root, { attributes: true, attributeFilter: ["class"] });
  syncClass();

  if (mode === "system") {
    darkQuery.addEventListener("change", () => {
      value = themeValue();
      syncClass();
      for (const callback of subscribers) {
        callback(value, () => subscribers.delete(callback));
      }
    });
  }
}

const mode = globalThis.SHOPIFY_ADMIN_THEME_MODE ?? "dark";
// Read once and drop it, so the page doesn't see the extension's global
delete globalThis.SHOPIFY_ADMIN_THEME_MODE;

// The script runs on every page of the hosts it matches, so leave alone anything that isn't framed
// by the admin
if (isEmbeddedInAdmin()) {
  themeApp(mode);
}
