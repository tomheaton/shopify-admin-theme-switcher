/**
 * Service worker. A click on the toolbar button moves to the next colour mode; the options page can
 * also set the mode and grant access to embedded apps.
 *
 * The content scripts are registered here rather than in the manifest so each one can be preceded
 * by a one-line mode file, which tells it the choice synchronously before the page's own scripts
 * run. The scripts read the mode as the page loads, so open admin tabs are reloaded to switch.
 */
import {
  ADMIN_MATCH,
  embeddedAppOrigins,
  LABELS,
  type Mode,
  nextMode,
  readMode,
  writeMode,
} from "./settings";

const BADGES: Record<Mode, string> = { light: "LT", dark: "DK", system: "AUTO" };
const BADGE_COLOR = "#6e6e6e";

/**
 * @param appOrigins match patterns for the embedded app hosts the extension may access
 */
export function contentScripts(
  mode: Mode,
  appOrigins: string[],
): chrome.scripting.RegisteredContentScript[] {
  const modeFile = `content/modes/${mode}.js`;
  const scripts: chrome.scripting.RegisteredContentScript[] = [
    {
      id: "admin",
      matches: [ADMIN_MATCH],
      js: [modeFile, "content/admin.js"],
      runAt: "document_start",
    },
  ];
  if (appOrigins.length > 0) {
    scripts.push({
      id: "embedded-app",
      matches: appOrigins,
      excludeMatches: [ADMIN_MATCH],
      js: [modeFile, "content/embedded-app.js"],
      runAt: "document_start",
      allFrames: true,
      // Polaris reads its theme from the page's own context, which an isolated world can't reach
      world: "MAIN",
    });
  }
  return scripts;
}

async function applySettings(): Promise<void> {
  const [mode, appOrigins] = await Promise.all([readMode(), embeddedAppOrigins()]);

  const registered = await chrome.scripting.getRegisteredContentScripts();
  if (registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: registered.map((script) => script.id) });
  }
  await chrome.scripting.registerContentScripts(contentScripts(mode, appOrigins));

  const next = LABELS[nextMode(mode)].toLowerCase();
  await Promise.all([
    chrome.action.setBadgeText({ text: BADGES[mode] }),
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR }),
    chrome.action.setTitle({
      title: `Shopify admin theme: ${LABELS[mode].toLowerCase()} (click for ${next})`,
    }),
  ]);
}

let syncing: Promise<void> = Promise.resolve();

/**
 * Registers the content scripts and updates the toolbar button for the stored settings. Calls are
 * queued, since overlapping unregister and register calls would clash on the script ids.
 */
export function sync(): Promise<void> {
  // A failed sync is reported to its own caller, and shouldn't stop the ones after it
  syncing = syncing.catch(() => undefined).then(applySettings);
  return syncing;
}

async function reloadAdminTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: ADMIN_MATCH });
  await Promise.all(
    tabs.flatMap((tab) => (tab.id === undefined ? [] : [chrome.tabs.reload(tab.id)])),
  );
}

async function syncAndReload(): Promise<void> {
  await sync();
  await reloadAdminTabs();
}

chrome.action.onClicked.addListener(async () => {
  await writeMode(nextMode(await readMode()));
});

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && "mode" in changes) {
    await syncAndReload();
  }
});

chrome.permissions.onAdded.addListener(syncAndReload);
chrome.permissions.onRemoved.addListener(syncAndReload);
