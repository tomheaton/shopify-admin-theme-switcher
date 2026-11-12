// Sets the admin's top-most <s-internal-theme-provider> to the admin-next theme in the chosen colour
// scheme, and puts the attributes back whenever the admin re-renders them or swaps the element out.
const mode = globalThis.SHOPIFY_ADMIN_THEME_MODE ?? "dark";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function colorScheme(): "light" | "dark" {
  if (mode === "system") {
    return darkQuery.matches ? "dark" : "light";
  }
  return mode;
}

function apply(): void {
  // Ancestors come before their descendants in document order, so the first match is the root
  const provider = document.querySelector("s-internal-theme-provider");
  if (!provider) {
    return;
  }
  const attributes = { theme: "admin-next", colorscheme: colorScheme() };
  for (const [name, value] of Object.entries(attributes)) {
    if (provider.getAttribute(name) !== value) {
      provider.setAttribute(name, value);
    }
  }
}

// Batch the mutations from one render into a single pass
let queued = false;
const observer = new MutationObserver(() => {
  if (queued) {
    return;
  }
  queued = true;
  queueMicrotask(() => {
    queued = false;
    apply();
  });
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["theme", "colorscheme"],
});
if (mode === "system") {
  darkQuery.addEventListener("change", apply);
}
apply();
