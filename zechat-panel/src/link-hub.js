// The client's hub, swapped for ZeChat's local link (vite.config.js).
//
// zechat-client reaches ZeChat through a ZeHub relay. Docked in zesignal it
// talks to the ZeChat on this machine instead, over its link.sock, through
// zesignal's main process (app/zechat_link.main.ts) — so Signal messages
// handed to the agent never leave the machine. Everything but openHub is the
// client's own.
export * from "./client/lib/hub.js";

const api = globalThis.zesignal;

/** "Error invoking remote method 'x': Error: why" → "why": the client shows command errors as they come. */
function reason(error) {
  return String(error?.message ?? error).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

export function openHub() {
  if (!api) return null;
  const listeners = new Map();
  const watchers = new Set();
  let status = { state: "connecting", peer: "zesignal@link", app: "zechat", target: null, error: null, apps: [] };

  const setStatus = (patch) => {
    status = { ...status, ...patch };
    for (const fn of [...watchers]) {
      try {
        fn(status);
      } catch {
        /* one drawer failing does not stop the others */
      }
    }
  };
  api.on("zpanel:status", setStatus);
  api.on("zpanel:event", ({ event, payload }) => {
    for (const fn of [...(listeners.get(event) || [])]) fn({ event, payload });
  });

  const bridge = {
    start() {
      api.status().then(setStatus, (e) => setStatus({ state: "closed", error: reason(e) }));
    },
    retry() {
      setStatus({ state: "connecting", error: null });
      api.retry().then(setStatus, (e) => setStatus({ state: "closed", error: reason(e) }));
    },
    async invoke(cmd, args = {}) {
      try {
        return await api.invoke(cmd, args);
      } catch (e) {
        throw reason(e);
      }
    },
    async listen(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return () => listeners.get(event)?.delete(handler);
    },
    onStatus(fn) {
      watchers.add(fn);
      fn(status);
      return () => watchers.delete(fn);
    },
    // One ZeChat, the one on this machine: nothing to choose.
    useApp() {},
    get status() {
      return status;
    },
  };
  bridge.start();
  return bridge;
}
