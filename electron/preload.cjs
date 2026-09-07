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
  showTodoWindow: () => ipcRenderer.invoke("todo-window:show"),
  hideTodoWindow: () => ipcRenderer.invoke("todo-window:hide"),
  toggleTodoCollapsed: () => ipcRenderer.invoke("todo-window:toggle-collapsed"),
  setTodoFollowing: (value) => ipcRenderer.invoke("todo-window:set-following", value),
  getTodoWindowState: () => ipcRenderer.invoke("todo-window:get-state"),
  broadcastState: (key, value) => ipcRenderer.send("state:broadcast", { key, value }),
  onSharedState: (callback) => {
    const handler = (_event, payload) => callback(payload.key, payload.value);
    ipcRenderer.on("state:shared", handler);
    return () => ipcRenderer.removeListener("state:shared", handler);
  },
  onTodoWindowState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("todo-window:state", handler);
    return () => ipcRenderer.removeListener("todo-window:state", handler);
  },
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
