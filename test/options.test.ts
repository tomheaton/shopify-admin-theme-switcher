// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { settle } from "./content-script";
import { createFakeChrome, type FakeState } from "./fake-chrome";

async function openOptions(state?: FakeState) {
  const fake = createFakeChrome(state);
  vi.stubGlobal("chrome", fake.chrome);
  const html = readFileSync(join(import.meta.dirname, "../src/options.html"), "utf8");
  const page = new DOMParser().parseFromString(html, "text/html");
  // The test imports the page's script itself, so drop the tag that would load it
  page.querySelectorAll("script").forEach((script) => {
    script.remove();
  });
  document.body.innerHTML = page.body.innerHTML;
  vi.resetModules();
  await import("../src/options");
  await settle();
  return fake;
}

function input(selector: string): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>(selector);
  if (!found) {
    throw new Error(`Missing ${selector}`);
  }
  return found;
}

async function click(element: HTMLElement) {
  element.click();
  await settle();
}

describe("options page", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the stored mode and whether all apps are themed", async () => {
    await openOptions({ mode: "system", origins: ["https://*/*"] });

    expect(input('input[value="system"]').checked).toBe(true);
    expect(input('input[name="allApps"]').checked).toBe(true);
  });

  it("stores the mode picked", async () => {
    const { storage } = await openOptions();
    expect(input('input[value="dark"]').checked).toBe(true);

    await click(input('input[value="light"]'));

    expect(storage.mode).toBe("light");
  });

  it("asks for and gives up access to all sites from the checkbox", async () => {
    const { chrome } = await openOptions();
    const allApps = input('input[name="allApps"]');

    await click(allApps);
    expect(await chrome.permissions.contains({ origins: ["https://*/*"] })).toBe(true);
    expect(allApps.checked).toBe(true);

    await click(allApps);
    expect(await chrome.permissions.contains({ origins: ["https://*/*"] })).toBe(false);
    expect(allApps.checked).toBe(false);
  });

  it("leaves the checkbox clear when access is refused", async () => {
    const { chrome } = await openOptions();
    vi.spyOn(chrome.permissions, "request").mockResolvedValue(false);

    await click(input('input[name="allApps"]'));

    expect(input('input[name="allApps"]').checked).toBe(false);
  });

  it("asks for access to one app host and lists it until removed", async () => {
    const { chrome } = await openOptions();
    const hostInput = input("#app-host");

    hostInput.value = "https://my-app.example.com/app";
    document
      .querySelector('button[type="submit"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();

    expect(await chrome.permissions.contains({ origins: ["https://my-app.example.com/*"] })).toBe(
      true,
    );
    expect(hostInput.value).toBe("");
    const item = document.querySelector("#app-host-list li");
    expect(item?.textContent).toContain("my-app.example.com");

    item?.querySelector("button")?.click();
    await settle();

    expect(await chrome.permissions.contains({ origins: ["https://my-app.example.com/*"] })).toBe(
      false,
    );
    expect(document.querySelectorAll("#app-host-list li")).toHaveLength(0);
  });

  it("explains what to enter when the app host is not valid", async () => {
    const { chrome } = await openOptions();
    const request = vi.spyOn(chrome.permissions, "request");

    input("#app-host").value = "http://my-app.example.com";
    (document.getElementById("settings") as HTMLFormElement).requestSubmit();
    await settle();

    expect(request).not.toHaveBeenCalled();
    expect(document.getElementById("app-host-error")?.hidden).toBe(false);
  });

  it("hides the per-app list while all apps are themed", async () => {
    await openOptions({ origins: ["https://*/*", "https://my-app.example.com/*"] });

    expect(document.getElementById("app-hosts")?.hidden).toBe(true);
  });

  it("follows mode changes made from the toolbar button", async () => {
    const { chrome } = await openOptions({ mode: "light" });

    await chrome.storage.local.set({ mode: "system" });
    await settle();

    expect(input('input[value="system"]').checked).toBe(true);
  });
});
