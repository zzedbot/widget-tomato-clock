import type { Settings, TimerMode, TimerState } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  autoCollapse: true,
  soundEnabled: true,
  volume: 80,
  alwaysOnTop: true,
  launchAtLogin: false
};

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function durationFor(mode: TimerMode, settings: Settings): number {
  const minutes = mode === "focus"
    ? settings.focusMinutes
    : mode === "shortBreak"
      ? settings.shortBreakMinutes
      : settings.longBreakMinutes;
  return minutes * 60_000;
}

export function createInitialState(settings = DEFAULT_SETTINGS, now = new Date()): TimerState {
  return {
    mode: "focus",
    phase: "idle",
    remainingMs: durationFor("focus", settings),
    durationMs: durationFor("focus", settings),
    endAt: null,
    task: "",
    completedToday: 0,
    completedDate: localDateKey(now),
    lastCompletionId: null
  };
}

export function normalizeForToday(state: TimerState, now = new Date()): TimerState {
  const today = localDateKey(now);
  if (state.completedDate === today) return state;
  return { ...state, completedToday: 0, completedDate: today };
}

export function startTimer(state: TimerState, now = Date.now()): TimerState {
  if (state.phase === "running") return state;
  return { ...state, phase: "running", endAt: now + Math.max(0, state.remainingMs) };
}

export function pauseTimer(state: TimerState, now = Date.now()): TimerState {
  if (state.phase !== "running" || state.endAt === null) return state;
  return { ...state, phase: "paused", remainingMs: Math.max(0, state.endAt - now), endAt: null };
}

export function resetTimer(state: TimerState, settings: Settings): TimerState {
  const durationMs = durationFor(state.mode, settings);
  return { ...state, phase: "idle", remainingMs: durationMs, durationMs, endAt: null };
}

export function nextModeAfter(mode: TimerMode, completedToday: number, interval: number): TimerMode {
  if (mode !== "focus") return "focus";
  return completedToday > 0 && completedToday % interval === 0 ? "longBreak" : "shortBreak";
}

export function completeTimer(state: TimerState, settings: Settings, now = Date.now()): TimerState {
  const normalized = normalizeForToday(state, new Date(now));
  const completedToday = normalized.mode === "focus" ? normalized.completedToday + 1 : normalized.completedToday;
  const nextMode = nextModeAfter(normalized.mode, completedToday, settings.longBreakInterval);
  const durationMs = durationFor(nextMode, settings);
  return {
    ...normalized,
    phase: "completed",
    remainingMs: 0,
    durationMs,
    endAt: null,
    completedToday,
    lastCompletionId: `${now}:${normalized.mode}`,
    mode: nextMode
  };
}

export function prepareNext(state: TimerState, settings: Settings): TimerState {
  const durationMs = durationFor(state.mode, settings);
  return { ...state, phase: "idle", remainingMs: durationMs, durationMs, endAt: null };
}

export function skipTimer(state: TimerState, settings: Settings): TimerState {
  const nextMode = nextModeAfter(state.mode, state.completedToday, settings.longBreakInterval);
  const durationMs = durationFor(nextMode, settings);
  return { ...state, mode: nextMode, phase: "idle", remainingMs: durationMs, durationMs, endAt: null };
}

export function remainingAt(state: TimerState, now = Date.now()): number {
  return state.phase === "running" && state.endAt !== null
    ? Math.max(0, state.endAt - now)
    : Math.max(0, state.remainingMs);
}

export function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
