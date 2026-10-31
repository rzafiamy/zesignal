import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const linkHub = here("./src/link-hub.js");

// The built panel is `dist/`, loaded by zesignal's main process in a view
// docked beside Signal (app/zechat_link.main.ts). `public/` (the preload, the
// icons) is copied as is.
export default defineConfig({
  base: "./",
  // The desktop renderer the client carries imports `zesdk`: here, as in the
  // client, that is the slice of it the page carries.
  resolve: { alias: { zesdk: here("./src/client/lib/zesdk/index.js") } },
  plugins: [
    tailwindcss(),
    {
      // The client's main.js reaches ZeChat through lib/hub.js; here it goes
      // through the local link instead. link-hub.js itself imports the
      // original for everything but openHub.
      name: "zesignal-link-hub",
      enforce: "pre",
      resolveId(source, importer) {
        if (source === "./lib/hub.js" && importer?.endsWith("/src/client/main.js")) {
          return linkHub;
        }
        return null;
      },
    },
  ],
  build: {
    target: "es2022",
    modulePreload: { polyfill: false },
    rollupOptions: { input: { panel: here("./panel.html") } },
  },
});
