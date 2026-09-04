const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tomatoDesktop", {
  setView: (view) => ipcRenderer.invoke("window:set-view", view),
  setAlwaysOnTop: (value) => ipcRenderer.invoke("window:set-always-on-top", value),
  setLaunchAtLogin: (value) => ipcRenderer.invoke("app:set-launch-at-login", value),
  showNotification: (payload) => ipcRenderer.invoke("notification:show", payload),
  updateTray: (payload) => ipcRenderer.send("tray:update", payload),
  hideWindow: () => ipcRenderer.invoke("window:hide"),
  expandEdge: () => ipcRenderer.invoke("window:expand-edge"),
  collapseEdge: () => ipcRenderer.invoke("window:collapse-edge"),
  onDockState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("window:dock-state", handler);
    return () => ipcRenderer.removeListener("window:dock-state", handler);
  },
  onTrayAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("tray:action", handler);
    return () => ipcRenderer.removeListener("tray:action", handler);
  }
});
