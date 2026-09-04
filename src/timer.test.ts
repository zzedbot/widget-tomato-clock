import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  completeTimer,
  createInitialState,
  formatTime,
  nextModeAfter,
  pauseTimer,
  startTimer
} from "./timer";

describe("timer state", () => {
  it("starts and pauses using an absolute target time", () => {
    const initial = createInitialState(DEFAULT_SETTINGS, new Date("2026-09-04T08:00:00"));
    const running = startTimer(initial, 1_000);
    expect(running.endAt).toBe(1_501_000);
    const paused = pauseTimer(running, 61_000);
    expect(paused.remainingMs).toBe(1_440_000);
    expect(paused.phase).toBe("paused");
  });

  it("selects a long break after the configured focus interval", () => {
    expect(nextModeAfter("focus", 3, 4)).toBe("shortBreak");
    expect(nextModeAfter("focus", 4, 4)).toBe("longBreak");
    expect(nextModeAfter("shortBreak", 4, 4)).toBe("focus");
  });

  it("counts only completed focus sessions", () => {
    const initial = { ...createInitialState(), completedToday: 3, phase: "running" as const };
    const completed = completeTimer(initial, DEFAULT_SETTINGS, Date.now());
    expect(completed.completedToday).toBe(4);
    expect(completed.mode).toBe("longBreak");
    expect(completed.phase).toBe("completed");
  });

  it("never formats a negative duration", () => {
    expect(formatTime(-10)).toBe("00:00");
    expect(formatTime(61_000)).toBe("01:01");
  });

  it("keeps the active session duration independent from later setting changes", () => {
    const initial = createInitialState(DEFAULT_SETTINGS);
    const changedSettings = { ...DEFAULT_SETTINGS, focusMinutes: 50 };
    const running = startTimer(initial, 0);
    expect(running.durationMs).toBe(25 * 60_000);
    expect(changedSettings.focusMinutes).toBe(50);
  });
});
