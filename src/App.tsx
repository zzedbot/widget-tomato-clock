import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronLeft,
  CirclePlay,
  Coffee,
  Minus,
  Pause,
  Pin,
  PinOff,
  Play,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  SkipForward,
  Volume2,
  X
} from "lucide-react";
import {
  DEFAULT_SETTINGS,
  completeTimer,
  createInitialState,
  durationFor,
  formatTime,
  normalizeForToday,
  pauseTimer,
  prepareNext,
  remainingAt,
  resetTimer,
  skipTimer,
  startTimer
} from "./timer";
import type { Settings, TimerMode, TimerState, ViewMode } from "./types";

const SETTINGS_KEY = "tomato-clock:settings:v1";
const TIMER_KEY = "tomato-clock:timer:v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? { ...fallback, ...JSON.parse(value) } : fallback;
  } catch {
    return fallback;
  }
}

function modeLabel(mode: TimerMode): string {
  return mode === "focus" ? "专注" : mode === "shortBreak" ? "短休息" : "长休息";
}

function phaseLabel(state: TimerState): string {
  if (state.phase === "completed") return state.mode === "focus" ? "休息结束" : "专注完成";
  if (state.phase === "paused") return "已暂停";
  if (state.phase === "idle") return state.mode === "focus" ? "准备专注" : `准备${modeLabel(state.mode)}`;
  return state.mode === "focus" ? "专注中" : `${modeLabel(state.mode)}中`;
}

function playBell(volume: number) {
  try {
    const context = new AudioContext();
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.18);
    gain.gain.setValueAtTime(Math.max(0.01, volume / 400), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
  } catch {
    // Sound is optional; system notification still fires.
  }
}

function TomatoMascot({ mood = "calm" }: { mood?: "calm" | "rest" | "happy" }) {
  return (
    <div className={`mascot mascot-${mood}`} aria-hidden="true">
      <span className="stem" />
      <span className="leaf" />
      <span className="eye eye-left" />
      <span className="eye eye-right" />
      <span className="mouth" />
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? "toggle-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="setting-row">
      <span className="setting-name">{label}</span>
      <div className="stepper">
        <button type="button" aria-label={`减少${label}`} onClick={() => onChange(Math.max(min, value - 1))}><Minus size={14} /></button>
        <span>{value}</span>
        <button type="button" aria-label={`增加${label}`} onClick={() => onChange(Math.min(max, value + 1))}><Plus size={14} /></button>
      </div>
    </div>
  );
}

function SettingsPanel({ value, onSave, onCancel }: { value: Settings; onSave: (settings: Settings) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value);
  const update = <K extends keyof Settings>(key: K, next: Settings[K]) => setDraft((current) => ({ ...current, [key]: next }));

  return (
    <section className="settings-panel">
      <header className="settings-header drag-region">
        <button className="text-button no-drag" type="button" onClick={onCancel}><ChevronLeft size={18} />设置</button>
        <button className="icon-button no-drag" type="button" aria-label="关闭设置" onClick={onCancel}><X size={18} /></button>
      </header>
      <div className="settings-scroll">
        <h2>专注与休息时长</h2>
        <div className="settings-group">
          <Stepper label="专注时长（分钟）" value={draft.focusMinutes} min={1} max={120} onChange={(v) => update("focusMinutes", v)} />
          <Stepper label="短休息（分钟）" value={draft.shortBreakMinutes} min={1} max={30} onChange={(v) => update("shortBreakMinutes", v)} />
          <Stepper label="长休息（分钟）" value={draft.longBreakMinutes} min={1} max={60} onChange={(v) => update("longBreakMinutes", v)} />
          <Stepper label="长休息间隔" value={draft.longBreakInterval} min={1} max={12} onChange={(v) => update("longBreakInterval", v)} />
        </div>

        <h2>自动化</h2>
        <div className="settings-group">
          <div className="setting-row"><span className="setting-name">自动开始休息</span><Toggle label="自动开始休息" checked={draft.autoStartBreak} onChange={(v) => update("autoStartBreak", v)} /></div>
          <div className="setting-row"><span className="setting-name">自动开始下一轮专注</span><Toggle label="自动开始下一轮专注" checked={draft.autoStartFocus} onChange={(v) => update("autoStartFocus", v)} /></div>
          <div className="setting-row"><span className="setting-name">专注时自动收起</span><Toggle label="专注时自动收起" checked={draft.autoCollapse} onChange={(v) => update("autoCollapse", v)} /></div>
        </div>

        <h2>声音与窗口</h2>
        <div className="settings-group">
          <div className="setting-row"><span className="setting-name"><Bell size={15} />提醒声音</span><Toggle label="提醒声音" checked={draft.soundEnabled} onChange={(v) => update("soundEnabled", v)} /></div>
          <div className="setting-row volume-row">
            <span className="setting-name"><Volume2 size={15} />音量</span>
            <input aria-label="提醒音量" type="range" min="0" max="100" value={draft.volume} onChange={(event) => update("volume", Number(event.target.value))} />
            <span className="volume-value">{draft.volume}%</span>
          </div>
          <div className="setting-row"><span className="setting-name">始终置顶</span><Toggle label="始终置顶" checked={draft.alwaysOnTop} onChange={(v) => update("alwaysOnTop", v)} /></div>
          <div className="setting-row"><span className="setting-name">开机自动启动</span><Toggle label="开机自动启动" checked={draft.launchAtLogin} onChange={(v) => update("launchAtLogin", v)} /></div>
        </div>
      </div>
      <footer className="settings-footer">
        <button type="button" className="secondary-button" onClick={() => setDraft(DEFAULT_SETTINGS)}>恢复默认</button>
        <button type="button" className="primary-button" onClick={() => onSave(draft)}>保存设置</button>
      </footer>
      <TomatoMascot mood="calm" />
    </section>
  );
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => readJson(SETTINGS_KEY, DEFAULT_SETTINGS));
  const [timer, setTimer] = useState<TimerState>(() => normalizeForToday(readJson(TIMER_KEY, createInitialState())));
  const [view, setView] = useState<ViewMode>("main");
  const [edgeDocked, setEdgeDocked] = useState(false);
  const [now, setNow] = useState(Date.now());
  const completionBusy = useRef(false);
  const remaining = remainingAt(timer, now);
  const progress = Math.min(1, Math.max(0, 1 - remaining / timer.durationMs));

  const persist = useCallback((next: TimerState) => {
    setTimer(next);
    localStorage.setItem(TIMER_KEY, JSON.stringify(next));
  }, []);

  const notifyCompletion = useCallback((finishedMode: TimerMode, next: TimerState) => {
    const focusFinished = finishedMode === "focus";
    const title = focusFinished ? "完成一个番茄" : "休息结束";
    const body = focusFinished ? "做得好，休息一下吧。" : "准备开始下一轮专注。";
    if (settings.soundEnabled) playBell(settings.volume);
    void window.tomatoDesktop?.showNotification({ title, body });

    const shouldAutoStart = focusFinished ? settings.autoStartBreak : settings.autoStartFocus;
    if (shouldAutoStart) {
      const started = startTimer(prepareNext(next, settings));
      persist(started);
      if (started.mode === "focus" && settings.autoCollapse && !edgeDocked) setView("mini");
    } else {
      persist(next);
      setView("main");
    }
  }, [edgeDocked, persist, settings]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (timer.phase !== "running" || remaining > 0 || completionBusy.current) return;
    completionBusy.current = true;
    const finishedMode = timer.mode;
    const next = completeTimer(timer, settings, Date.now());
    notifyCompletion(finishedMode, next);
    window.setTimeout(() => { completionBusy.current = false; }, 300);
  }, [notifyCompletion, remaining, settings, timer]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.tomatoDesktop?.setAlwaysOnTop(settings.alwaysOnTop);
  }, [settings]);

  useEffect(() => {
    if (view !== "edge") void window.tomatoDesktop?.setView(view);
  }, [view]);

  useEffect(() => window.tomatoDesktop?.onDockState((state) => {
    setEdgeDocked(state.docked);
    setView((current) => {
      if (state.collapsed) return "edge";
      if (state.docked) return "main";
      return current === "edge" ? "main" : current;
    });
  }), []);

  const toggleTimer = useCallback(() => {
    if (timer.phase === "running") {
      persist(pauseTimer(timer));
      setView("main");
      return;
    }
    const ready = timer.phase === "completed" ? prepareNext(timer, settings) : timer;
    const started = startTimer(ready);
    persist(started);
    if (started.mode === "focus" && settings.autoCollapse && !edgeDocked) setView("mini");
  }, [edgeDocked, persist, settings, timer]);

  const skip = useCallback(() => {
    persist(skipTimer(timer, settings));
    setView("main");
  }, [persist, settings, timer]);

  useEffect(() => window.tomatoDesktop?.onTrayAction((action) => {
    if (action === "toggle") toggleTimer();
    if (action === "skip") skip();
    if (action === "show-main") setView("main");
    if (action === "settings") setView("settings");
  }), [skip, toggleTimer]);

  useEffect(() => {
    window.tomatoDesktop?.updateTray({
      label: phaseLabel(timer),
      remaining: formatTime(remaining),
      running: timer.phase === "running",
      paused: timer.phase === "paused"
    });
  }, [remaining, timer]);

  const mood = useMemo(() => timer.phase === "completed" ? "happy" : timer.mode === "focus" ? "calm" : "rest", [timer]);
  const isBreak = timer.mode !== "focus";

  const saveSettings = async (next: Settings) => {
    const launchAtLogin = await window.tomatoDesktop?.setLaunchAtLogin(next.launchAtLogin);
    const saved = { ...next, launchAtLogin: launchAtLogin ?? next.launchAtLogin };
    setSettings(saved);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
    setView("main");
  };

  if (view === "settings") {
    return <SettingsPanel value={settings} onSave={saveSettings} onCancel={() => setView("main")} />;
  }

  if (view === "edge") {
    return (
      <main
        className={`edge-widget ${isBreak ? "break-theme" : ""}`}
        title={`${phaseLabel(timer)} · ${formatTime(remaining)}`}
        onMouseEnter={() => window.tomatoDesktop?.expandEdge()}
      >
        <TomatoMascot mood={mood} />
        <span className="edge-status" aria-hidden="true" />
        <span className="sr-only">{phaseLabel(timer)}，剩余 {formatTime(remaining)}。鼠标移入展开挂件。</span>
      </main>
    );
  }

  if (view === "mini") {
    return (
      <main className={`mini-widget drag-region ${isBreak ? "break-theme" : ""}`} onDoubleClick={() => setView("main")}>
        <TomatoMascot mood={mood} />
        <div className="mini-copy">
          <strong>{formatTime(remaining)}</strong>
          <span>{timer.task.trim() || phaseLabel(timer)}</span>
        </div>
        <button className="mini-action no-drag" type="button" aria-label={timer.phase === "running" ? "暂停" : "继续"} onClick={toggleTimer}>
          {timer.phase === "running" ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
        </button>
        <button className="mini-expand no-drag" type="button" aria-label="展开挂件" onClick={() => setView("main")}><CirclePlay size={15} /></button>
      </main>
    );
  }

  return (
    <main className={`widget drag-region ${isBreak ? "break-theme" : ""}`} onMouseLeave={() => edgeDocked && window.tomatoDesktop?.collapseEdge()}>
      <div className="drag-handle" aria-hidden="true" />
      <header className="widget-header">
        <div className="status"><span className="status-dot" />{phaseLabel(timer)}</div>
        <div className="window-actions no-drag">
          <button className={`icon-button ${settings.alwaysOnTop ? "active" : ""}`} type="button" aria-label={settings.alwaysOnTop ? "取消置顶" : "保持置顶"} onClick={() => setSettings((value) => ({ ...value, alwaysOnTop: !value.alwaysOnTop }))}>
            {settings.alwaysOnTop ? <Pin size={16} fill="currentColor" /> : <PinOff size={16} />}
          </button>
          <button className="icon-button" type="button" aria-label="设置" onClick={() => setView("settings")}><SettingsIcon size={17} /></button>
          <button className="icon-button" type="button" aria-label="隐藏到托盘" onClick={() => window.tomatoDesktop?.hideWindow()}><X size={17} /></button>
        </div>
      </header>

      <section className="widget-content">
        <div className="timer-ring" style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}>
          <div className="timer-inner">
            <strong>{formatTime(remaining)}</strong>
            <span>{timer.mode === "focus" ? `第 ${timer.completedToday + 1} 个番茄` : modeLabel(timer.mode)}</span>
          </div>
          <TomatoMascot mood={mood} />
        </div>
        <div className="task-area no-drag">
          <label htmlFor="task">这一轮要完成</label>
          <input
            id="task"
            value={timer.task}
            placeholder="准备开始专注"
            disabled={timer.phase === "running"}
            maxLength={80}
            onChange={(event) => persist({ ...timer, task: event.target.value })}
          />
          <span className="progress-label">今日进度</span>
          <div className="session-progress" aria-label={`今日完成 ${timer.completedToday} 个番茄`}>
            {[0, 1, 2, 3].map((index) => <i key={index} className={index < timer.completedToday % 4 ? "done" : ""} />)}
            <small>{timer.completedToday}</small>
          </div>
        </div>
      </section>

      <footer className="widget-actions no-drag">
        <button type="button" className="primary-action" onClick={toggleTimer}>
          {timer.phase === "running" ? <><Pause size={17} fill="currentColor" />暂停</> : <><Play size={17} fill="currentColor" />{timer.phase === "paused" ? "继续" : timer.phase === "completed" ? "开始下一阶段" : isBreak ? "开始休息" : "开始专注"}</>}
        </button>
        <button type="button" className="secondary-action" aria-label="重置" onClick={() => persist(resetTimer(timer, settings))}><RotateCcw size={18} /></button>
        <button type="button" className="secondary-action" aria-label="跳过当前阶段" onClick={skip}><SkipForward size={19} /></button>
      </footer>
    </main>
  );
}
