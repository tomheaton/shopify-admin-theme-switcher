import type { Document } from "happy-dom";
import { describe, expect, it } from "vitest";
import { runContentScript, settle } from "./content-script";

const ADMIN_URL = "https://admin.shopify.com/store/example";
const PROVIDERS = `
  <s-internal-theme-provider id="root" theme="admin" colorscheme="light">
    <s-internal-theme-provider id="nested" colorscheme="light"></s-internal-theme-provider>
  </s-internal-theme-provider>
`;

function themeOf(document: Document, id = "root") {
  const provider = document.getElementById(id);
  return {
    theme: provider?.getAttribute("theme"),
    colorscheme: provider?.getAttribute("colorscheme"),
  };
}

describe("admin content script", () => {
  it("sets the root theme provider to admin-next in the chosen scheme", () => {
    const { document } = runContentScript("admin.ts", {
      url: ADMIN_URL,
      body: PROVIDERS,
      mode: "dark",
    });

    expect(themeOf(document)).toEqual({ theme: "admin-next", colorscheme: "dark" });
    expect(themeOf(document, "nested")).toEqual({ theme: null, colorscheme: "light" });
  });

  it("themes a provider the admin renders after the script has run", async () => {
    const { document } = runContentScript("admin.ts", { url: ADMIN_URL, mode: "dark" });

    document.body.innerHTML = PROVIDERS;
    await settle();

    expect(themeOf(document)).toEqual({ theme: "admin-next", colorscheme: "dark" });
  });

  it("puts the attributes back when the admin rewrites them", async () => {
    const { document } = runContentScript("admin.ts", {
      url: ADMIN_URL,
      body: PROVIDERS,
      mode: "light",
    });

    document.getElementById("root")?.setAttribute("colorscheme", "dark");
    document.getElementById("root")?.setAttribute("theme", "admin");
    await settle();

    expect(themeOf(document)).toEqual({ theme: "admin-next", colorscheme: "light" });
  });

  it("follows the system scheme in auto mode", async () => {
    const { document, darkQuery } = runContentScript("admin.ts", {
      url: ADMIN_URL,
      body: PROVIDERS,
      mode: "system",
      darkSystem: true,
    });
    expect(themeOf(document).colorscheme).toBe("dark");
    // Let the observer see the script's own first changes, so only the system change is left
    await settle();

    darkQuery.setDark(false);
    await settle();

    expect(themeOf(document).colorscheme).toBe("light");
  });
});
