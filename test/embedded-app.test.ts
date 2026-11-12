import type { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { runContentScript, settle } from "./content-script";

const APP_URL = "https://app.example.com/";
const ADMIN_ORIGIN = "https://admin.shopify.com";
const DARK_CLASS = "p-partial-theme-admin-next-dark";
const THEME_CONTEXT = Symbol.for("internal-theme-provider");

interface ThemeValue {
  colorScheme: string;
  theme: string;
}

/** Asks for the theme the way a Polaris component does, from an element in the page. */
function requestTheme(window: Window, { subscribe = false } = {}) {
  const received: ThemeValue[] = [];
  let unsubscribe: (() => void) | undefined;
  const event = Object.assign(
    new window.Event("context-request", { bubbles: true, composed: true }),
    {
      context: THEME_CONTEXT,
      subscribe,
      callback(value: ThemeValue, dispose: () => void) {
        received.push(value);
        unsubscribe = dispose;
      },
    },
  );
  window.document.body.dispatchEvent(event);
  return {
    received,
    unsubscribe: () => {
      unsubscribe?.();
    },
  };
}

describe("embedded app content script", () => {
  it("answers theme requests with the chosen scheme when framed by the admin", () => {
    const { window, document } = runContentScript("embedded-app.ts", {
      url: APP_URL,
      mode: "dark",
      ancestorOrigins: [ADMIN_ORIGIN],
    });

    const { received } = requestTheme(window);

    expect(received).toEqual([
      expect.objectContaining({ theme: "admin-next", colorScheme: "dark" }),
    ]);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  it("themes frames nested inside an embedded app", () => {
    const { window } = runContentScript("embedded-app.ts", {
      url: "https://widgets.example.net/",
      mode: "light",
      ancestorOrigins: [new URL(APP_URL).origin, ADMIN_ORIGIN],
    });

    expect(requestTheme(window).received).toEqual([
      expect.objectContaining({ colorScheme: "light" }),
    ]);
  });

  it.each([
    ["opened on its own", []],
    ["framed by another site", ["https://example.org"]],
    [
      "framed by an app that is itself framed by another site",
      [ADMIN_ORIGIN, "https://example.org"],
    ],
  ])("leaves the page alone when %s", (_case, ancestorOrigins: string[]) => {
    const { window, document } = runContentScript("embedded-app.ts", {
      url: APP_URL,
      mode: "dark",
      ancestorOrigins,
    });

    expect(requestTheme(window).received).toEqual([]);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  it("hides the mode global from the page", () => {
    const { window } = runContentScript("embedded-app.ts", {
      url: APP_URL,
      mode: "dark",
    });

    expect("SHOPIFY_ADMIN_THEME_MODE" in window).toBe(false);
  });

  it("keeps the dark class when the app rewrites the class list", async () => {
    const { document } = runContentScript("embedded-app.ts", {
      url: APP_URL,
      mode: "dark",
      ancestorOrigins: [ADMIN_ORIGIN],
    });

    document.documentElement.className = "hydrated";
    await settle();

    expect([...document.documentElement.classList]).toEqual(["hydrated", DARK_CLASS]);
  });

  it("updates subscribed components when the system scheme changes in auto mode", async () => {
    const { window, document, darkQuery } = runContentScript("embedded-app.ts", {
      url: APP_URL,
      mode: "system",
      darkSystem: false,
      ancestorOrigins: [ADMIN_ORIGIN],
    });
    const subscribed = requestTheme(window, { subscribe: true });
    const once = requestTheme(window);

    darkQuery.setDark(true);
    await settle();

    expect(subscribed.received.map((value) => value.colorScheme)).toEqual(["light", "dark"]);
    expect(once.received.map((value) => value.colorScheme)).toEqual(["light"]);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);

    subscribed.unsubscribe();
    darkQuery.setDark(false);
    expect(subscribed.received).toHaveLength(2);
  });
});
