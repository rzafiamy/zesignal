// The docked ZeChat panel's only way out: zesignal's main process
// (app/zechat_link.main.ts), which holds the link to ZeChat and Signal's data.
const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = new Set(["zpanel:event", "zpanel:status", "zpanel:view"]);

contextBridge.exposeInMainWorld("zesignal", {
  invoke: (cmd, args) => ipcRenderer.invoke("zpanel:invoke", cmd, args),
  status: () => ipcRenderer.invoke("zpanel:status"),
  retry: () => ipcRenderer.invoke("zpanel:retry"),
  tools: () => ipcRenderer.invoke("zpanel:tools"),
  view: () => ipcRenderer.invoke("zpanel:view"),
  signal: (name, args) => ipcRenderer.invoke("zpanel:signal", name, args),
  insert: (text) => ipcRenderer.invoke("zpanel:insert", text),
  close: () => ipcRenderer.invoke("zpanel:close"),
  on(channel, fn) {
    if (!CHANNELS.has(channel)) return () => {};
    const handler = (_event, data) => fn(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.off(channel, handler);
  },
});
