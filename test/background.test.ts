import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChrome, type FakeState } from "./fake-chrome";

async function loadServiceWorker(state?: FakeState) {
  const fake = createFakeChrome(state);
  vi.stubGlobal("chrome", fake.chrome);
  vi.resetModules();
  const background = await import("../src/background");
  return { ...fake, background };
}

function summarise(scripts: Map<string, chrome.scripting.RegisteredContentScript>) {
  return [...scripts.values()].map(({ id, matches, js }) => ({ id, matches, js }));
}

describe("service worker", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers only the admin script, in dark mode, on install", async () => {
    const { chrome, scripts, badge } = await loadServiceWorker();

    await chrome.runtime.onInstalled.dispatch();

    expect(summarise(scripts)).toEqual([
      {
        id: "admin",
        matches: ["https://admin.shopify.com/*"],
        js: ["content/modes/dark.js", "content/admin.js"],
      },
    ]);
    expect(badge).toEqual({ text: "DK", title: "Shopify admin theme: dark (click for auto)" });
  });

  it("falls back to dark for a mode it does not know", async () => {
    const { chrome, scripts } = await loadServiceWorker({ mode: "sepia" });

    await chrome.runtime.onStartup.dispatch();

    expect(scripts.get("admin")?.js).toEqual(["content/modes/dark.js", "content/admin.js"]);
  });

  it("cycles light, dark and auto on each toolbar click and reloads admin tabs", async () => {
    const { chrome, storage, scripts, reloaded, badge } = await loadServiceWorker({
      mode: "light",
      tabs: [
        { id: 1, url: "https://admin.shopify.com/store/example/orders" },
        { id: 2, url: "https://example.com/" },
      ],
    });

    await chrome.action.onClicked.dispatch();
    expect(storage.mode).toBe("dark");

    await chrome.action.onClicked.dispatch();
    expect(storage.mode).toBe("system");
    expect(scripts.get("admin")?.js).toEqual(["content/modes/system.js", "content/admin.js"]);
    expect(badge).toEqual({ text: "AUTO", title: "Shopify admin theme: auto (click for light)" });

    await chrome.action.onClicked.dispatch();
    expect(storage.mode).toBe("light");
    expect(reloaded).toEqual([1, 1, 1]);
  });

  it("themes embedded apps on the hosts it has been granted", async () => {
    const { chrome, scripts } = await loadServiceWorker({
      mode: "light",
      origins: ["https://app.example.com/*"],
    });

    await chrome.runtime.onInstalled.dispatch();

    expect(scripts.get("embedded-app")).toMatchObject({
      matches: ["https://app.example.com/*"],
      excludeMatches: ["https://admin.shopify.com/*"],
      js: ["content/modes/light.js", "content/embedded-app.js"],
      allFrames: true,
      world: "MAIN",
    });
  });

  it("starts and stops theming embedded apps as access to all sites is granted and removed", async () => {
    const { chrome, scripts, reloaded } = await loadServiceWorker({
      tabs: [{ id: 7, url: "https://admin.shopify.com/store/example" }],
    });
    await chrome.runtime.onInstalled.dispatch();
    expect(scripts.has("embedded-app")).toBe(false);

    await chrome.permissions.request({ origins: ["https://*/*"] });
    expect(scripts.get("embedded-app")?.matches).toEqual(["https://*/*"]);

    await chrome.permissions.remove({ origins: ["https://*/*"] });
    expect(scripts.has("embedded-app")).toBe(false);
    expect(reloaded).toEqual([7, 7]);
  });

  it("does not clash on script ids when settings change in quick succession", async () => {
    const { chrome, background, scripts } = await loadServiceWorker();

    await Promise.all([
      chrome.runtime.onInstalled.dispatch(),
      chrome.storage.local.set({ mode: "light" }),
      background.sync(),
    ]);

    expect(scripts.get("admin")?.js).toEqual(["content/modes/light.js", "content/admin.js"]);
  });
});
