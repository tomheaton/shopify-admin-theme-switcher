import type { Mode } from "./settings";

declare global {
  /** Set by the one-line mode file registered ahead of each content script. */
  var SHOPIFY_ADMIN_THEME_MODE: Mode | undefined;
}
