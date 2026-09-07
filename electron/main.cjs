const { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, Tray } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { collapsedBounds, containsPoint, expandedBounds, findDockEdge } = require("./docking.cjs");
const { companionBounds } = require("./companion.cjs");

if (process.env.TOMATO_E2E_USER_DATA) {
  app.setPath("userData", process.env.TOMATO_E2E_USER_DATA);
}

const VIEW_SIZES = {
  main: { width: 392, height: 270 },
  mini: { width: 300, height: 86 },
  settings: { width: 430, height: 650 },
  edge: { width: 62, height: 62 }
};

let mainWindow;
let todoWindow;
let tray;
let quitting = false;
let trayState = { label: "待开始", remaining: "25:00", running: false, paused: false };
let dockedEdge = null;
let expandedEdgeBounds = null;
let adjustingBounds = false;
let dockCollapsed = false;
let userMoving = false;
let collapseTimer = null;
let edgeCheckTimer = null;
let boundsAdjustmentTimer = null;
let todoFollowing = true;
let todoUserHidden = false;
let todoCollapsed = false;
let positioningTodo = false;
let currentView = "main";

function statePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function readWindowState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    return {};
  }
}

function writeWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const current = readWindowState();
  const bounds = dockedEdge && expandedEdgeBounds ? expandedEdgeBounds : mainWindow.getBounds();
  const todoBounds = todoWindow && !todoWindow.isDestroyed() ? todoWindow.getBounds() : current.todoBounds;
  fs.writeFileSync(statePath(), JSON.stringify({ ...current, bounds, dockedEdge, todoBounds, todoFollowing, todoCollapsed }));
}

function sendTodoWindowState() {
  if (todoWindow && !todoWindow.isDestroyed()) todoWindow.webContents.send("todo-window:state", { following: todoFollowing, collapsed: todoCollapsed });
}

function shouldShowTodoWindow() {
  return !todoUserHidden && currentView === "main" && !dockCollapsed;
}

function positionTodoWindow() {
  if (!mainWindow || !todoWindow || mainWindow.isDestroyed() || todoWindow.isDestroyed() || !todoFollowing) return;
  const mainBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(mainBounds);
  const { bounds } = companionBounds(mainBounds, display.workArea, todoCollapsed ? 46 : 570);
  positioningTodo = true;
  todoWindow.setBounds(bounds);
  setTimeout(() => { positioningTodo = false; }, 80);
}

function showTodoCompanion(focus = false) {
  if (!todoWindow || todoWindow.isDestroyed() || !shouldShowTodoWindow()) return;
  if (todoFollowing) positionTodoWindow();
  todoWindow.showInactive();
  if (focus) todoWindow.focus();
  sendTodoWindowState();
}

function hideTodoCompanion() {
  if (todoWindow && !todoWindow.isDestroyed()) todoWindow.hide();
}

function stopBoundsAdjustment() {
  clearTimeout(boundsAdjustmentTimer);
  boundsAdjustmentTimer = null;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setResizable(false);
  adjustingBounds = false;
}

function setBoundsSafely(bounds) {
  if (!mainWindow) return;
  stopBoundsAdjustment();
  adjustingBounds = true;
  mainWindow.setResizable(true);
  // Windows native resizing becomes visibly uneven when driven frame by frame.
  // Apply the bounds once and let Chromium animate the rendered surface on the
  // compositor thread instead.
  mainWindow.setBounds(bounds);
  mainWindow.setResizable(false);
  boundsAdjustmentTimer = setTimeout(() => { adjustingBounds = false; }, 80);
}

function collapseToEdge(edge = dockedEdge, sourceBounds) {
  if (!mainWindow || !edge) return;
  clearTimeout(collapseTimer);
  const current = sourceBounds || mainWindow.getBounds();
  const display = screen.getDisplayMatching(current);
  if (!dockedEdge) expandedEdgeBounds = current;
  dockedEdge = edge;
  dockCollapsed = true;
  hideTodoCompanion();
  setBoundsSafely(collapsedBounds(edge, current, display.workArea, VIEW_SIZES.edge.width));
  mainWindow.webContents.send("window:dock-state", { docked: true, collapsed: true });
  writeWindowState();
}

function expandFromEdge() {
  if (!mainWindow || !dockedEdge) return;
  clearTimeout(collapseTimer);
  const current = mainWindow.getBounds();
  const display = screen.getDisplayMatching(current);
  expandedEdgeBounds = expandedBounds(dockedEdge, current, display.workArea, VIEW_SIZES.main);
  dockCollapsed = false;
  setBoundsSafely(expandedEdgeBounds);
  mainWindow.webContents.send("window:dock-state", { docked: true, collapsed: false });
  setTimeout(() => showTodoCompanion(), 100);
}

function checkEdgeDock() {
  if (!mainWindow || adjustingBounds) return;
  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const edge = findDockEdge(bounds, display.workArea);
  if (edge) {
    // A docked expanded window deliberately still touches the edge. Do not
    // collapse it again until the renderer reports mouse leave.
    if (!dockedEdge) collapseToEdge(edge, bounds);
    else if (dockCollapsed && edge !== dockedEdge) collapseToEdge(edge, bounds);
  } else if (dockedEdge) {
    dockedEdge = null;
    dockCollapsed = false;
    expandedEdgeBounds = null;
    mainWindow.webContents.send("window:dock-state", { docked: false, collapsed: false });
    writeWindowState();
  }
}

function scheduleEdgeCheck(delay = 120) {
  if (adjustingBounds || userMoving) return;
  clearTimeout(edgeCheckTimer);
  edgeCheckTimer = setTimeout(checkEdgeDock, delay);
}

function visibleBounds(saved) {
  if (!saved || typeof saved.x !== "number" || typeof saved.y !== "number") return {};
  const displays = screen.getAllDisplays();
  const visible = displays.some(({ workArea }) =>
    saved.x < workArea.x + workArea.width - 40 &&
    saved.x + saved.width > workArea.x + 40 &&
    saved.y < workArea.y + workArea.height - 40 &&
    saved.y + saved.height > workArea.y + 40
  );
  return visible ? { x: saved.x, y: saved.y } : {};
}

function trayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="#2f3a2f" d="M13 6c2-4 5-4 7 0 3-1 5 0 6 2-2 1-4 2-5 4H11C9 10 7 9 5 8c2-2 5-3 8-2Z"/><path fill="#d9483b" d="M5 16c0-6 5-9 11-9s11 3 11 9c0 7-5 12-11 12S5 23 5 16Z"/><circle cx="12" cy="16" r="1.2" fill="#3b2a24"/><circle cx="20" cy="16" r="1.2" fill="#3b2a24"/><path d="M12 21c2 2 6 2 8 0" fill="none" stroke="#3b2a24" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function sendAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  currentView = action === "settings" ? "settings" : "main";
  if (currentView === "main") showTodoCompanion();
  else hideTodoCompanion();
  mainWindow.webContents.send("tray:action", action);
}

function rebuildTrayMenu() {
  if (!tray) return;
  const primaryLabel = trayState.running && !trayState.paused ? "暂停" : trayState.paused ? "继续" : "开始专注";
  tray.setToolTip(`番茄伴侣 · ${trayState.label} ${trayState.remaining}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `${trayState.label}  ${trayState.remaining}`, enabled: false },
    { type: "separator" },
    { label: primaryLabel, click: () => sendAction("toggle") },
    { label: "跳过当前阶段", click: () => sendAction("skip") },
    { type: "separator" },
    { label: "显示主挂件", click: () => sendAction("show-main") },
    { label: "显示待办窗口", click: () => {
      todoUserHidden = false;
      currentView = "main";
      mainWindow?.show();
      showTodoCompanion(true);
    } },
    { label: "设置", click: () => sendAction("settings") },
    { type: "separator" },
    { label: "退出", click: () => { quitting = true; app.quit(); } }
  ]));
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.on("double-click", () => sendAction("show-main"));
  rebuildTrayMenu();
}

function createWindow() {
  const saved = readWindowState();
  const primaryWorkArea = screen.getPrimaryDisplay().workArea;
  const defaultMainBounds = {
    x: primaryWorkArea.x + primaryWorkArea.width - VIEW_SIZES.main.width - 48,
    y: primaryWorkArea.y + Math.max(48, Math.floor((primaryWorkArea.height - VIEW_SIZES.main.height - 8 - 570) / 2))
  };
  dockedEdge = saved.dockedEdge || null;
  expandedEdgeBounds = saved.bounds || null;
  todoFollowing = saved.todoFollowing !== false;
  todoCollapsed = Boolean(saved.todoCollapsed);
  mainWindow = new BrowserWindow({
    ...VIEW_SIZES.main,
    ...defaultMainBounds,
    ...visibleBounds(saved.bounds),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    show: false,
    alwaysOnTop: saved.alwaysOnTop ?? true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  todoWindow = new BrowserWindow({
    width: VIEW_SIZES.main.width,
    height: todoCollapsed ? 46 : 570,
    ...(!todoFollowing ? visibleBounds(saved.todoBounds) : {}),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    show: false,
    alwaysOnTop: saved.alwaysOnTop ?? true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    const separator = process.env.VITE_DEV_SERVER_URL.includes("?") ? "&" : "?";
    todoWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}${separator}window=todo`);
  } else {
    todoWindow.loadFile(path.join(__dirname, "../dist/index.html"), { query: { window: "todo" } });
  }

  todoWindow.webContents.once("did-finish-load", () => showTodoCompanion());
  todoWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      todoUserHidden = true;
      todoWindow.hide();
    }
  });
  todoWindow.on("will-move", () => {
    if (positioningTodo) return;
    todoFollowing = false;
    sendTodoWindowState();
  });
  todoWindow.on("moved", () => {
    if (!positioningTodo) writeWindowState();
  });

  mainWindow.webContents.once("did-finish-load", () => {
    if (dockedEdge) collapseToEdge(dockedEdge, saved.bounds);
    mainWindow.show();
    if (!dockedEdge) showTodoCompanion();
  });
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
      hideTodoCompanion();
    }
  });
  mainWindow.on("move", () => {
    // Programmatic moves do not emit will-move/moved on Windows, so keep the
    // debounced fallback for them. During a real drag, wait for mouse release.
    if (!userMoving) scheduleEdgeCheck();
    if (todoFollowing) positionTodoWindow();
    writeWindowState();
  });
  mainWindow.on("will-move", () => {
    userMoving = true;
    stopBoundsAdjustment();
    clearTimeout(collapseTimer);
    clearTimeout(edgeCheckTimer);
  });
  mainWindow.on("moved", () => {
    userMoving = false;
    scheduleEdgeCheck(0);
    writeWindowState();
  });
}

app.setName("番茄伴侣");
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

app.on("second-instance", () => {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
  currentView = "main";
  showTodoCompanion();
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on("window-all-closed", () => {
  // Keep the process alive while the tray icon is available on Windows.
});
app.on("before-quit", () => {
  quitting = true;
  writeWindowState();
});

ipcMain.handle("window:set-view", (_event, view) => {
  const size = VIEW_SIZES[view] || VIEW_SIZES.main;
  if (!mainWindow) return;
  currentView = view;
  if (view === "settings" || view === "mini") {
    dockedEdge = null;
    dockCollapsed = false;
    expandedEdgeBounds = null;
    mainWindow.webContents.send("window:dock-state", { docked: false, collapsed: false });
  }
  if (view === "edge") return;
  mainWindow.setResizable(true);
  mainWindow.setSize(size.width, size.height, true);
  mainWindow.setResizable(false);
  if (view === "main") showTodoCompanion();
  else hideTodoCompanion();
});

ipcMain.handle("window:expand-edge", () => expandFromEdge());
ipcMain.handle("window:collapse-edge", () => {
  if (!dockedEdge) return;
  clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => {
    if (!mainWindow || !dockedEdge || dockCollapsed) return;
    // Resizing and swapping the edge view can emit a transient mouseleave.
    // Verify the real system cursor position before committing the collapse.
    if (containsPoint(mainWindow.getBounds(), screen.getCursorScreenPoint())) return;
    collapseToEdge();
  }, 420);
});

ipcMain.handle("window:set-always-on-top", (_event, value) => {
  if (!mainWindow) return;
  mainWindow.setAlwaysOnTop(Boolean(value));
  todoWindow?.setAlwaysOnTop(Boolean(value));
  const state = readWindowState();
  fs.writeFileSync(statePath(), JSON.stringify({ ...state, alwaysOnTop: Boolean(value) }));
});

ipcMain.handle("window:hide", () => {
  mainWindow?.hide();
  hideTodoCompanion();
});

ipcMain.handle("todo-window:show", () => {
  todoUserHidden = false;
  showTodoCompanion(true);
});
ipcMain.handle("todo-window:hide", () => {
  todoUserHidden = true;
  hideTodoCompanion();
});
ipcMain.handle("todo-window:set-following", (_event, value) => {
  todoFollowing = Boolean(value);
  if (todoFollowing) positionTodoWindow();
  sendTodoWindowState();
  writeWindowState();
});
ipcMain.handle("todo-window:toggle-collapsed", () => {
  todoCollapsed = !todoCollapsed;
  if (todoFollowing) positionTodoWindow();
  else if (todoWindow && !todoWindow.isDestroyed()) {
    const bounds = todoWindow.getBounds();
    todoWindow.setBounds({ ...bounds, height: todoCollapsed ? 46 : 570 });
  }
  sendTodoWindowState();
  writeWindowState();
});
ipcMain.handle("todo-window:get-state", () => ({ following: todoFollowing, collapsed: todoCollapsed }));

ipcMain.on("state:broadcast", (event, payload) => {
  for (const window of [mainWindow, todoWindow]) {
    if (window && !window.isDestroyed() && window.webContents.id !== event.sender.id) window.webContents.send("state:shared", payload);
  }
});

ipcMain.handle("app:set-launch-at-login", (_event, value) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(value), path: process.execPath });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle("notification:show", (_event, payload) => {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({ title: payload.title, body: payload.body, icon: trayIcon() });
  notification.on("click", () => sendAction("show-main"));
  notification.show();
  return true;
});

ipcMain.on("tray:update", (_event, payload) => {
  trayState = { ...trayState, ...payload };
  rebuildTrayMenu();
});
