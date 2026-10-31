// The panel docked in zesignal: the ZeChat client (src/client, copied from
// zechat-client by `npm run update:client`) with Signal plugged in. The
// plugin must be registered before the client's main.js runs, which asks for
// it as it boots — hence the dynamic import after it.
import { register } from "./client/lib/plugin.js";
import { createSignalPlugin } from "./signal/plugin.js";
import "./signal/panel.css";

register(createSignalPlugin());
await import("./client/main.js");
