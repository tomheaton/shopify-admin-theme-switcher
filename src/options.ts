import {
  ALL_APPS_PERMISSION,
  ALL_SITES_MATCH,
  appHostPattern,
  embeddedAppOrigins,
  isMode,
  readMode,
  writeMode,
} from "./settings";

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing #${id}`);
  }
  return found;
}

const form = element("settings") as HTMLFormElement;
const allApps = element("all-apps") as HTMLInputElement;
const appHosts = element("app-hosts");
const appHostList = element("app-host-list");
const appHost = element("app-host") as HTMLInputElement;
const appHostError = element("app-host-error");

/** @param origin a match pattern such as https://my-app.example.com/* */
function hostItem(origin: string): HTMLLIElement {
  const item = document.createElement("li");
  const host = document.createElement("span");
  host.textContent = origin.replace(/^https:\/\/|\/\*$/g, "");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => chrome.permissions.remove({ origins: [origin] }));
  item.append(host, remove);
  return item;
}

async function render(): Promise<void> {
  const [mode, origins] = await Promise.all([readMode(), embeddedAppOrigins()]);
  const radio = form.querySelector<HTMLInputElement>(`input[name="mode"][value="${mode}"]`);
  if (radio) {
    radio.checked = true;
  }
  allApps.checked = origins.includes(ALL_SITES_MATCH);
  appHosts.hidden = allApps.checked;
  appHostList.replaceChildren(
    ...origins.filter((origin) => origin !== ALL_SITES_MATCH).map((origin) => hostItem(origin)),
  );
}

form.addEventListener("change", async (event) => {
  const input = event.target as HTMLInputElement;
  if (input.name === "mode" && isMode(input.value)) {
    await writeMode(input.value);
  } else if (input === allApps) {
    // A request has to be made in the click's user gesture, so it can't wait on anything else
    const granted = allApps.checked
      ? await chrome.permissions.request(ALL_APPS_PERMISSION)
      : !(await chrome.permissions.remove(ALL_APPS_PERMISSION));
    allApps.checked = granted;
    appHosts.hidden = granted;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const origin = appHostPattern(appHost.value);
  appHostError.hidden = origin !== null;
  if (origin && (await chrome.permissions.request({ origins: [origin] }))) {
    appHost.value = "";
  }
});

// Keep in step with the toolbar button and with access changed elsewhere
chrome.storage.onChanged.addListener(render);
chrome.permissions.onAdded.addListener(render);
chrome.permissions.onRemoved.addListener(render);
void render();
