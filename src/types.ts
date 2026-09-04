export type TimerMode = "focus" | "shortBreak" | "longBreak";
export type TimerPhase = "idle" | "running" | "paused" | "completed";
export type ViewMode = "main" | "mini" | "settings";

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
  onTrayAction: (callback: (action: string) => void) => () => void;
}
