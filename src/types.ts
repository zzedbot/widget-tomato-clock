export type TimerMode = "focus" | "shortBreak" | "longBreak";
export type TimerPhase = "idle" | "running" | "paused" | "completed";
export type ViewMode = "main" | "mini" | "settings" | "todos" | "edge";

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
}

export interface TodoState {
  todos: Todo[];
  selectedIds: string[];
  activeTodoId: string | null;
  activeLongId: string | null;
  sessionId: string | null;
  segments: TimeSegment[];
  punches: PunchRecord[];
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
  onDockState: (callback: (state: { docked: boolean; collapsed: boolean }) => void) => () => void;
  onTrayAction: (callback: (action: string) => void) => () => void;
}
