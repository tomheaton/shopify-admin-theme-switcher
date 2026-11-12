/**
 * An in-memory stand-in for the parts of the extension APIs the service worker and options page
 * use. Events keep their listeners so tests can fire them, and the scripting API rejects duplicate
 * ids the way Chrome does.
 */

type Listener = (...args: never[]) => unknown;

function fakeEvent() {
  const listeners: Listener[] = [];
  return {
    addListener(listener: Listener) {
      listeners.push(listener);
    },
    async dispatch(...args: unknown[]) {
      await Promise.all(
        listeners.map((listener) => (listener as (...a: unknown[]) => unknown)(...args)),
      );
    },
  };
}

export interface FakeState {
  mode?: unknown;
  /** Host permissions granted besides the admin */
  origins?: string[];
  tabs?: { id: number; url: string }[];
}

interface PermissionRequest {
  origins: string[];
}

export function createFakeChrome({ mode, origins = [], tabs = [] }: FakeState = {}) {
  const storage: Record<string, unknown> = mode === undefined ? {} : { mode };
  const scripts = new Map<string, chrome.scripting.RegisteredContentScript>();
  const grantedOrigins = new Set(["https://admin.shopify.com/*", ...origins]);
  const reloaded: number[] = [];
  const badge = { text: "", title: "" };

  const fake = {
    storage: {
      local: {
        get(key: string) {
          return Promise.resolve(key in storage ? { [key]: storage[key] } : {});
        },
        async set(items: Record<string, unknown>) {
          const changes: Record<string, { oldValue?: unknown; newValue: unknown }> = {};
          for (const [key, newValue] of Object.entries(items)) {
            changes[key] = { oldValue: storage[key], newValue };
            storage[key] = newValue;
          }
          await fake.storage.onChanged.dispatch(changes, "local");
        },
      },
      onChanged: fakeEvent(),
    },
    permissions: {
      getAll() {
        return Promise.resolve({
          permissions: ["scripting", "storage"],
          origins: [...grantedOrigins],
        });
      },
      contains({ origins: wanted }: PermissionRequest) {
        return Promise.resolve(wanted.every((origin) => grantedOrigins.has(origin)));
      },
      async request({ origins: wanted }: PermissionRequest) {
        for (const origin of wanted) {
          grantedOrigins.add(origin);
        }
        await fake.permissions.onAdded.dispatch({ origins: wanted });
        return true;
      },
      async remove({ origins: removed }: PermissionRequest) {
        for (const origin of removed) {
          grantedOrigins.delete(origin);
        }
        await fake.permissions.onRemoved.dispatch({ origins: removed });
        return true;
      },
      onAdded: fakeEvent(),
      onRemoved: fakeEvent(),
    },
    scripting: {
      // Each call yields first, so other queued work runs in between as with the real API
      async getRegisteredContentScripts() {
        await Promise.resolve();
        return [...scripts.values()];
      },
      async unregisterContentScripts({ ids }: { ids: string[] }) {
        await Promise.resolve();
        for (const id of ids) {
          if (!scripts.delete(id)) {
            throw new Error(`Nonexistent script ID '${id}'`);
          }
        }
      },
      async registerContentScripts(added: chrome.scripting.RegisteredContentScript[]) {
        await Promise.resolve();
        for (const script of added) {
          if (scripts.has(script.id)) {
            throw new Error(`Duplicate script ID '${script.id}'`);
          }
          scripts.set(script.id, script);
        }
      },
    },
    action: {
      setBadgeText({ text }: { text: string }) {
        badge.text = text;
        return Promise.resolve();
      },
      setBadgeBackgroundColor() {
        return Promise.resolve();
      },
      setTitle({ title }: { title: string }) {
        badge.title = title;
        return Promise.resolve();
      },
      onClicked: fakeEvent(),
    },
    tabs: {
      query({ url }: { url: string }) {
        const prefix = url.replace(/\*$/, "");
        return Promise.resolve(tabs.filter((tab) => tab.url.startsWith(prefix)));
      },
      reload(id: number) {
        reloaded.push(id);
        return Promise.resolve();
      },
    },
    runtime: {
      onInstalled: fakeEvent(),
      onStartup: fakeEvent(),
    },
  };

  return { chrome: fake, storage, scripts, reloaded, badge };
}
