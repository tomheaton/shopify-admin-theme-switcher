# Shopify Admin Theme Switcher

A Chrome extension that switches the Shopify admin between light, dark and auto (follow the system) colour schemes, using the admin's own `admin-next` theme. It can also theme embedded apps built with [Polaris web components](https://shopify.dev/docs/api/app-home/polaris-web-components).

## Install

1. Clone this repository and build it (needs the Node version in `.nvmrc` and [pnpm](https://pnpm.io)):

   ```bash
   pnpm install
   pnpm build
   ```
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `dist` folder.

Requires Chrome 102 or later.

## Use

Click the toolbar button to cycle between light (`LT`), dark (`DK`) and auto (`AUTO`). The badge shows the current mode, and open admin tabs reload to pick it up.

Right-click the button and choose **Options** to pick a mode directly or turn on embedded apps.

### Embedded apps

Embedded apps run in an iframe served from the app developer's own site, so the extension needs access to that site to theme them. On the options page, either:

- tick **All apps**, and Chrome asks for access to all sites, or
- add each app's host under **Or only these apps**, and Chrome asks for access to just that host. To find it, inspect the app's `<iframe>` in the admin and take the host from its `src`.

On those sites the script only acts in frames whose top-level page is `admin.shopify.com`, and leaves every other page alone.

Only apps that use Polaris web components follow the theme. Apps built with Polaris React or their own styles stay as they are.

## How it works

The service worker registers the content scripts at runtime rather than in the manifest, so each can be preceded by a one-line file under `src/content/modes/` that sets the chosen mode before the page's own scripts run.

- **Admin** (`src/content/admin.ts`): sets `theme="admin-next"` and `colorscheme` on the admin's root `<s-internal-theme-provider>`, and puts them back whenever the admin re-renders.
- **Embedded apps** (`src/content/embedded-app.ts`): runs in the page's own context and answers the `context-request` event that Polaris components send for their theme, ahead of Polaris's own provider. It also adds the `p-partial-theme-admin-next-dark` class that switches the design tokens to the dark set.

Both rely on Shopify internals that aren't a public API, so an admin or Polaris update can break them.

## Development

The source is TypeScript in `src/`, bundled into `dist/` with [esbuild](https://esbuild.github.io).

```bash
nvm use
pnpm install
pnpm dev
```

| Script           | What it does                                            |
| ---------------- | ------------------------------------------------------- |
| `pnpm build`     | Builds the extension into `dist/`                       |
| `pnpm dev`       | Rebuilds on every change                                |
| `pnpm test`      | Runs the [Vitest](https://vitest.dev) suite             |
| `pnpm lint`      | Lints with [Biome](https://biomejs.dev)                 |
| `pnpm format`    | Formats with Biome and applies its safe fixes           |
| `pnpm typecheck` | Type-checks with `tsc`                                  |
| `pnpm check`     | Biome, the type-check, tests and build, as CI runs them |

After a rebuild, click the reload button on the extension's card in `chrome://extensions`.

## Licence

[MIT](LICENSE)
