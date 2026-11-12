import { join } from "node:path";
import { buildSync } from "esbuild";
import { Window } from "happy-dom";
import type { Mode } from "../src/settings";

/** A `prefers-color-scheme: dark` query whose answer the test controls. */
export function fakeDarkQuery(dark: boolean) {
  const listeners = new Set<() => void>();
  return {
    matches: dark,
    addEventListener(_type: string, listener: () => void) {
      listeners.add(listener);
    },
    setDark(value: boolean) {
      this.matches = value;
      listeners.forEach((listener) => {
        listener();
      });
    },
  };
}

interface PageOptions {
  url: string;
  /** Markup for the document's body */
  body?: string;
  /** The mode file registered ahead of the script */
  mode: Mode;
  /** What the system colour scheme reports */
  darkSystem?: boolean;
  /** The origins of the frames above, nearest first; none means the page is the top-level one */
  ancestorOrigins?: string[];
}

const compiled = new Map<string, string>();

/** Bundles a content script the way the build does, as a classic script. */
function compile(file: string): string {
  let source = compiled.get(file);
  if (source === undefined) {
    const result = buildSync({
      entryPoints: [join(import.meta.dirname, "../src/content", file)],
      bundle: true,
      format: "iife",
      write: false,
    });
    source = result.outputFiles[0].text;
    compiled.set(file, source);
  }
  return source;
}

/**
 * Loads a page in a fresh window and runs a content script in it the way Chrome does: the mode file
 * first, then the script, before any of the page's own scripts.
 *
 * @param script path under src/content
 */
export function runContentScript(
  script: string,
  { url, body, mode, darkSystem = false, ancestorOrigins = [] }: PageOptions,
) {
  const window = new Window({ url });
  window.document.body.innerHTML = body ?? "";
  const darkQuery = fakeDarkQuery(darkSystem);
  Object.defineProperty(window, "matchMedia", { value: () => darkQuery });
  Object.defineProperty(window.location, "ancestorOrigins", { value: ancestorOrigins });
  if (ancestorOrigins.length > 0) {
    Object.defineProperty(window, "top", { value: {} });
  }

  for (const file of [`modes/${mode}.ts`, script]) {
    // Bind the browser globals the scripts use to this window
    const run = new Function(
      "window",
      "globalThis",
      "document",
      "location",
      "MutationObserver",
      compile(file),
    ) as (...globals: unknown[]) => void;
    run(window, window, window.document, window.location, window.MutationObserver);
  }
  return { window, document: window.document, darkQuery };
}

/** Lets MutationObserver callbacks and the microtasks they queue run. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
