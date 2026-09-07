export type TimerMode = "focus" | "shortBreak" | "longBreak";
export type TimerPhase = "idle" | "running" | "paused" | "completed";
export type ViewMode = "main" | "mini" | "settings" | "edge";

export type TodoKind = "long" | "short";
export type TodoStatus = "open" | "completed";

export interface Todo {
  id: string;
  kind: TodoKind;
  title: string;
  status: TodoStatus;
  parentLongId: string | null;
  createdAt: number;
  completedAt: number | null;
  cycleStartedAt: number;
}

export interface TimeSegment {
  id: string;
  sessionId: string;
  todoId: string;
  longTodoId: string | null;
  startedAt: number;
  endedAt: number | null;
}

export interface PunchRecord {
  id: string;
  todoId: string;
  sessionId: string | null;
  punchedAt: number;
  elapsedMs: number;
  totalElapsedMs: number;
  previousSelectedIds: string[];
  previousActiveTodoId: string | null;
  previousActiveLongId: string | null;
  detachedChildIds: string[];
  undoneAt: number | null;
}

export interface ReopenRecord {
  id: string;
  todoId: string;
  reopenedAt: number;
  joinedSession: boolean;
}

export interface TodoState {
  todos: Todo[];
  selectedIds: string[];
  activeTodoId: string | null;
  activeLongId: string | null;
  sessionId: string | null;
  segments: TimeSegment[];
  punches: PunchRecord[];
  reopens: ReopenRecord[];
}

export interface Settings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
  autoCollapse: boolean;
  soundEnabled: boolean;
  volume: number;
  alwaysOnTop: boolean;
  launchAtLogin: boolean;
}

export interface TimerState {
  mode: TimerMode;
  phase: TimerPhase;
  remainingMs: number;
  durationMs: number;
  endAt: number | null;
  task: string;
  completedToday: number;
  completedDate: string;
  lastCompletionId: string | null;
}

export interface DesktopApi {
  setView: (view: ViewMode) => Promise<void>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  setLaunchAtLogin: (value: boolean) => Promise<boolean>;
  showNotification: (payload: { title: string; body: string }) => Promise<boolean>;
  updateTray: (payload: { label: string; remaining: string; running: boolean; paused: boolean }) => void;
  hideWindow: () => Promise<void>;
  expandEdge: () => Promise<void>;
  collapseEdge: () => Promise<void>;
  showTodoWindow: () => Promise<void>;
  hideTodoWindow: () => Promise<void>;
  toggleTodoCollapsed: () => Promise<void>;
  setTodoFollowing: (value: boolean) => Promise<void>;
  getTodoWindowState: () => Promise<{ following: boolean; collapsed: boolean }>;
  broadcastState: (key: string, value: unknown) => void;
  onSharedState: (callback: (key: string, value: unknown) => void) => () => void;
  onTodoWindowState: (callback: (state: { following: boolean; collapsed: boolean }) => void) => () => void;
  onDockState: (callback: (state: { docked: boolean; collapsed: boolean }) => void) => () => void;
  onTrayAction: (callback: (action: string) => void) => () => void;
}
