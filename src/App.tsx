import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Check,
  ChevronLeft,
  CirclePlay,
  Clock3,
  Coffee,
  EyeOff,
  History,
  Link,
  Link2Off,
  ListTodo,
  Minus,
  Pause,
  Pin,
  PinOff,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  SkipForward,
  Target,
  Undo2,
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
import { addTodo, elapsedForLongTodo, elapsedForTodo, endTodoSession, EMPTY_TODO_STATE, normalizeTodoState, pauseTodoSession, punchTodo, reopenTodo, startTodoSession, switchActiveTodo, switchLongTodo, toggleTodoSelection, undoPunch } from "./todos";
import type { Settings, TimerMode, TimerState, Todo, TodoKind, TodoState, ViewMode } from "./types";

const SETTINGS_KEY = "tomato-clock:settings:v1";
const TIMER_KEY = "tomato-clock:timer:v1";
const TODOS_KEY = "tomato-clock:todos:v1";

function makeId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

function formatElapsed(milliseconds: number): string {
  const minutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

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

function formatSystemClock(timestamp: number) {
  const value = new Date(timestamp);
  const date = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(value);
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(value);
  const compactDate = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }).format(value);
  return { date, time, compactDate, iso: value.toISOString() };
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

function TimerApp() {
  const [settings, setSettings] = useState<Settings>(() => readJson(SETTINGS_KEY, DEFAULT_SETTINGS));
  const [timer, setTimer] = useState<TimerState>(() => normalizeForToday(readJson(TIMER_KEY, createInitialState())));
  const [todos, setTodos] = useState<TodoState>(() => normalizeTodoState(readJson(TODOS_KEY, EMPTY_TODO_STATE)));
  const [view, setView] = useState<ViewMode>("main");
  const [edgeDocked, setEdgeDocked] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [punchNotice, setPunchNotice] = useState<string | null>(null);
  const completionBusy = useRef(false);
  const punchNoticeTimer = useRef<number | null>(null);
  const todosRef = useRef(todos);
  const edgeHoverReadyAt = useRef(0);
  const remaining = remainingAt(timer, now);
  const progress = Math.min(1, Math.max(0, 1 - remaining / timer.durationMs));
  const systemClock = formatSystemClock(now);
  const selectedTodos = todos.selectedIds
    .map((id) => todos.todos.find((todo) => todo.id === id && todo.status === "open"))
    .filter((todo): todo is NonNullable<typeof todo> => Boolean(todo));
  const activeTodo = todos.todos.find((todo) => todo.id === todos.activeTodoId && todo.status === "open");
  const activeLong = todos.todos.find((todo) => todo.id === todos.activeLongId && todo.status === "open");

  const persistTodos = useCallback((next: TodoState) => {
    todosRef.current = next;
    setTodos(next);
    localStorage.setItem(TODOS_KEY, JSON.stringify(next));
    window.tomatoDesktop?.broadcastState(TODOS_KEY, next);
  }, []);

  const persist = useCallback((next: TimerState) => {
    setTimer(next);
    localStorage.setItem(TIMER_KEY, JSON.stringify(next));
    window.tomatoDesktop?.broadcastState(TIMER_KEY, next);
  }, []);

  useEffect(() => window.tomatoDesktop?.onSharedState((key, value) => {
    if (key === TODOS_KEY) {
      const next = normalizeTodoState(value as TodoState);
      todosRef.current = next;
      setTodos(next);
      localStorage.setItem(TODOS_KEY, JSON.stringify(next));
    }
  }), []);

  const notifyCompletion = useCallback((finishedMode: TimerMode, next: TimerState) => {
    const focusFinished = finishedMode === "focus";
    const title = focusFinished ? "完成一个番茄" : "休息结束";
    const body = focusFinished ? "做得好，休息一下吧。" : "准备开始下一轮专注。";
    if (settings.soundEnabled) playBell(settings.volume);
    void window.tomatoDesktop?.showNotification({ title, body });

    const shouldAutoStart = focusFinished ? settings.autoStartBreak : settings.autoStartFocus;
    if (shouldAutoStart) {
      const ready = prepareNext(next, settings);
      if (ready.mode === "focus" && todosRef.current.selectedIds.length === 0) {
        persist(ready);
        void window.tomatoDesktop?.showTodoWindow();
        return;
      }
      const started = startTimer(ready);
      if (started.mode === "focus") persistTodos(startTodoSession(todosRef.current, Date.now(), makeId("session"), makeId("segment")));
      persist(started);
      if (started.mode === "focus" && settings.autoCollapse && !edgeDocked) setView("mini");
    } else {
      persist(next);
      setView("main");
    }
  }, [edgeDocked, persist, persistTodos, settings]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (timer.phase !== "running" || remaining > 0 || completionBusy.current) return;
    completionBusy.current = true;
    const finishedMode = timer.mode;
    if (finishedMode === "focus") persistTodos(endTodoSession(todosRef.current, timer.endAt || Date.now()));
    const next = completeTimer(timer, settings, Date.now());
    notifyCompletion(finishedMode, next);
    window.setTimeout(() => { completionBusy.current = false; }, 300);
  }, [notifyCompletion, persistTodos, remaining, settings, timer]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.tomatoDesktop?.setAlwaysOnTop(settings.alwaysOnTop);
  }, [settings]);

  useEffect(() => {
    if (view !== "edge") void window.tomatoDesktop?.setView(view);
  }, [view]);

  useEffect(() => window.tomatoDesktop?.onDockState((state) => {
    setEdgeDocked(state.docked);
    if (state.collapsed) edgeHoverReadyAt.current = Date.now() + 240;
    setView((current) => {
      if (state.collapsed) return "edge";
      if (state.docked) return "main";
      return current === "edge" ? "main" : current;
    });
  }), []);

  const toggleTimer = useCallback(() => {
    if (timer.phase === "running") {
      if (timer.mode === "focus") persistTodos(pauseTodoSession(todosRef.current, Date.now()));
      persist(pauseTimer(timer));
      setView("main");
      return;
    }
    const ready = timer.phase === "completed" ? prepareNext(timer, settings) : timer;
    if (ready.mode === "focus" && todosRef.current.selectedIds.length === 0) {
      void window.tomatoDesktop?.showTodoWindow();
      return;
    }
    const started = startTimer(ready);
    if (started.mode === "focus") persistTodos(startTodoSession(todosRef.current, Date.now(), makeId("session"), makeId("segment")));
    persist(started);
    if (started.mode === "focus" && settings.autoCollapse && !edgeDocked) setView("mini");
  }, [edgeDocked, persist, persistTodos, settings, timer]);

  const skip = useCallback(() => {
    if (timer.mode === "focus") persistTodos(endTodoSession(todosRef.current, Date.now()));
    persist(skipTimer(timer, settings));
    setView("main");
  }, [persist, persistTodos, settings, timer]);

  const reset = useCallback(() => {
    if (timer.mode === "focus") persistTodos(endTodoSession(todosRef.current, Date.now()));
    persist(resetTimer(timer, settings));
  }, [persist, persistTodos, settings, timer]);

  const activateTodo = useCallback((id: string) => persistTodos(switchActiveTodo(todosRef.current, id, Date.now(), makeId("segment"), timer.phase === "running" && timer.mode === "focus")), [persistTodos, timer]);
  const punch = useCallback((id: string) => {
    const target = todosRef.current.todos.find((todo) => todo.id === id);
    if (!target) return;
    if (target?.kind === "long" && todosRef.current.todos.some((todo) => todo.parentLongId === id && todo.status === "open") && !window.confirm("这个长期待办仍有未完成的短期待办，确认 Punch？")) return;
    const punchedAt = Date.now();
    const elapsed = target.kind === "long" ? elapsedForLongTodo(todosRef.current, id, punchedAt) : elapsedForTodo(todosRef.current, id, punchedAt);
    persistTodos(punchTodo(todosRef.current, id, punchedAt, makeId("punch"), makeId("segment"), timer.phase === "running" && timer.mode === "focus"));
    setPunchNotice(`已 Punch · ${target.title} · ${formatElapsed(elapsed)}`);
    if (punchNoticeTimer.current) window.clearTimeout(punchNoticeTimer.current);
    punchNoticeTimer.current = window.setTimeout(() => setPunchNotice(null), 5000);
  }, [persistTodos, timer]);
  const undoLatestPunch = useCallback(() => {
    const latest = todosRef.current.punches.slice().reverse().find((record) => record.undoneAt === null && Date.now() - record.punchedAt <= 5_000);
    if (!latest) return;
    persistTodos(undoPunch(todosRef.current, latest.id, Date.now(), makeId("segment"), timer.phase === "running" && timer.mode === "focus"));
    setPunchNotice(null);
  }, [persistTodos, timer]);

  useEffect(() => () => {
    if (punchNoticeTimer.current) window.clearTimeout(punchNoticeTimer.current);
  }, []);

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
        onMouseEnter={() => {
          if (Date.now() >= edgeHoverReadyAt.current) void window.tomatoDesktop?.expandEdge();
        }}
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
          <div className="mini-meta">
            <span className="mini-task" title={selectedTodos.map((todo) => todo.title).join("、")}>{activeTodo?.title || activeLong?.title || phaseLabel(timer)}{selectedTodos.length > 1 ? ` · 本轮 ${selectedTodos.length} 项` : ""}</span>
            <time dateTime={systemClock.iso} aria-label={`系统日期时间 ${systemClock.date} ${systemClock.time}`}>
              {systemClock.compactDate} · {systemClock.time}
            </time>
          </div>
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
        <time className="system-clock" dateTime={systemClock.iso} aria-label={`系统日期时间 ${systemClock.date} ${systemClock.time}`}>
          <span>{systemClock.date}</span>
          <strong>{systemClock.time}</strong>
        </time>
        <div className="window-actions no-drag">
          <button className={`icon-button ${settings.alwaysOnTop ? "active" : ""}`} type="button" aria-label={settings.alwaysOnTop ? "取消置顶" : "保持置顶"} onClick={() => setSettings((value) => ({ ...value, alwaysOnTop: !value.alwaysOnTop }))}>
            {settings.alwaysOnTop ? <Pin size={16} fill="currentColor" /> : <PinOff size={16} />}
          </button>
          <button className="icon-button" type="button" aria-label="设置" onClick={() => setView("settings")}><SettingsIcon size={17} /></button>
          <button className="icon-button" type="button" aria-label="隐藏到托盘" onClick={() => window.tomatoDesktop?.hideWindow()}><X size={17} /></button>
        </div>
      </header>

      <section className="widget-content">
        {punchNotice && <div className="punch-notice main-notice" role="status"><Check size={14} /><span>{punchNotice}</span><button type="button" onClick={undoLatestPunch}><Undo2 size={11} />撤销</button></div>}
        <div className="timer-ring" style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}>
          <div className="timer-inner">
            <strong>{formatTime(remaining)}</strong>
            <span>{timer.mode === "focus" ? `第 ${timer.completedToday + 1} 个番茄` : modeLabel(timer.mode)}</span>
          </div>
          <TomatoMascot mood={mood} />
        </div>
        <div className="task-area no-drag">
          <div className="active-context">
            <span>{activeLong ? <><Target size={12} />{activeLong.title}</> : "未选择长期目标"}</span>
          </div>
          <div className="active-task-line"><strong>{activeTodo?.title || (todos.selectedIds.length ? "选择当前执行任务" : "开始前选择待办")}</strong>{activeTodo && <button onClick={() => punch(activeTodo.id)}><Check size={12} />Punch</button>}</div>
          {activeTodo && <small className="active-elapsed">本轮累计 {formatElapsed(elapsedForTodo(todos, activeTodo.id, now))}</small>}
          {selectedTodos.length > 0 && <div className="session-queue">
            <div className="session-queue-label"><span>本轮待办</span><small>{selectedTodos.length} 项</small></div>
            <div className="session-queue-items" onWheel={(event) => { event.currentTarget.scrollLeft += event.deltaY; }}>
              {selectedTodos.map((todo) => <button
                key={todo.id}
                type="button"
                className={`${todo.id === activeTodo?.id ? "active" : ""} ${todo.kind}`}
                aria-current={todo.id === activeTodo?.id ? "true" : undefined}
                aria-label={`${todo.id === activeTodo?.id ? "当前执行" : "切换到"}${todo.title}`}
                title={todo.title}
                onClick={() => activateTodo(todo.id)}
              >{todo.kind === "long" ? <Target size={10} /> : <ListTodo size={10} />}<span>{todo.title}</span></button>)}
            </div>
          </div>}
          <span className="progress-label">今日进度</span>
          <div className="session-progress" aria-label={`今日完成 ${timer.completedToday} 个番茄`}>
            {[0, 1, 2, 3].map((index) => <i key={index} className={index < timer.completedToday % 4 ? "done" : ""} />)}
            <small>{timer.completedToday}</small>
          </div>
        </div>
      </section>

      <footer className="widget-actions no-drag">
        <button type="button" className="primary-action" onClick={toggleTimer}>
          {timer.phase === "running" ? <><Pause size={17} fill="currentColor" />暂停</> : <><Play size={17} fill="currentColor" />{timer.phase === "paused" ? "继续" : timer.phase === "completed" ? "开始下一阶段" : isBreak ? "开始休息" : todos.selectedIds.length ? "开始专注" : "选择待办开始"}</>}
        </button>
        <button type="button" className="secondary-action" aria-label="重置" onClick={reset}><RotateCcw size={18} /></button>
        <button type="button" className="secondary-action" aria-label="跳过当前阶段" onClick={skip}><SkipForward size={19} /></button>
      </footer>
    </main>
  );
}

function completionCount(state: TodoState, todoId: string) {
  return state.punches.filter((punch) => punch.todoId === todoId && punch.undoneAt === null).length;
}

function TodoHistoryPanel({ todo, state, onClose, onRestore }: { todo: Todo; state: TodoState; onClose: () => void; onRestore: (join: boolean) => void }) {
  const punches = state.punches.filter((record) => record.todoId === todo.id).slice().reverse();
  const reopens = state.reopens.filter((record) => record.todoId === todo.id);
  const total = todo.kind === "long" ? elapsedForLongTodo(state, todo.id) : elapsedForTodo(state, todo.id);
  return <aside className="todo-history no-drag">
    <header><button onClick={onClose}><ChevronLeft size={15} />返回</button><span>第 {completionCount(state, todo.id)} 次完成</span></header>
    <div className="todo-history-scroll">
      <h2>{todo.title}</h2><p>{todo.kind === "long" ? "长期待办" : "短期待办"} · {todo.status === "completed" ? "已办" : "待办"}</p>
      <div className="history-stats"><div><small>历史总计</small><strong>{formatElapsed(total)}</strong></div><div><small>完成次数</small><strong>{completionCount(state, todo.id)}</strong></div><div><small>恢复次数</small><strong>{reopens.length}</strong></div></div>
      <h3>活动时间线</h3>
      <div className="history-timeline">
        {[...punches.map((record) => ({ at: record.punchedAt, title: record.undoneAt ? "Punch 已撤销" : "Punch 完成", copy: `${new Date(record.punchedAt).toLocaleString("zh-CN")} · 本次 ${formatElapsed(record.elapsedMs)}` })), ...reopens.map((record) => ({ at: record.reopenedAt, title: "恢复为待办", copy: `${new Date(record.reopenedAt).toLocaleString("zh-CN")} · ${record.joinedSession ? "已加入本轮" : "仅恢复"}` }))].sort((a, b) => b.at - a.at).map((event) => <div key={`${event.title}:${event.at}`}><i /><strong>{event.title}</strong><span>{event.copy}</span></div>)}
        <div><i /><strong>创建待办</strong><span>{new Date(todo.createdAt).toLocaleString("zh-CN")}</span></div>
      </div>
    </div>
    {todo.status === "completed" && <footer><button onClick={() => onRestore(false)}>恢复为待办</button><button onClick={() => onRestore(true)}>恢复并加入本轮</button></footer>}
  </aside>;
}

function TodoCompanionApp() {
  const [todos, setTodos] = useState<TodoState>(() => normalizeTodoState(readJson(TODOS_KEY, EMPTY_TODO_STATE)));
  const [timer, setTimer] = useState<TimerState>(() => normalizeForToday(readJson(TIMER_KEY, createInitialState())));
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<"open" | "completed">("open");
  const [kind, setKind] = useState<TodoKind>("short");
  const [filter, setFilter] = useState<"all" | TodoKind>("all");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const todosRef = useRef(todos);
  const running = timer.phase === "running" && timer.mode === "focus";

  const persistTodos = useCallback((next: TodoState) => {
    todosRef.current = next;
    setTodos(next);
    localStorage.setItem(TODOS_KEY, JSON.stringify(next));
    window.tomatoDesktop?.broadcastState(TODOS_KEY, next);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    void window.tomatoDesktop?.getTodoWindowState().then((state) => {
      if (state) { setFollowing(state.following); setCollapsed(state.collapsed); }
    });
    const removeShared = window.tomatoDesktop?.onSharedState((key, value) => {
      if (key === TODOS_KEY) {
        const next = normalizeTodoState(value as TodoState);
        todosRef.current = next;
        setTodos(next);
        localStorage.setItem(TODOS_KEY, JSON.stringify(next));
      }
      if (key === TIMER_KEY) {
        const next = value as TimerState;
        setTimer(next);
        localStorage.setItem(TIMER_KEY, JSON.stringify(next));
      }
    });
    const removeWindowState = window.tomatoDesktop?.onTodoWindowState((state) => { setFollowing(state.following); setCollapsed(state.collapsed); });
    return () => { window.clearInterval(interval); removeShared?.(); removeWindowState?.(); };
  }, []);

  const mutateAttribution = (action: (state: TodoState, at: number, segmentId: string, tracking: boolean) => TodoState) => {
    const at = Date.now();
    persistTodos(action(todosRef.current, at, makeId("segment"), running));
  };
  const add = () => {
    if (!title.trim()) return;
    const id = makeId("todo");
    let next = addTodo(todosRef.current, kind, title, id);
    if (running && !next.activeTodoId) next = switchActiveTodo(next, id, Date.now(), makeId("segment"), true);
    persistTodos(next); setTitle(""); setTab("open");
  };
  const punch = (id: string) => {
    const target = todosRef.current.todos.find((todo) => todo.id === id);
    if (!target) return;
    if (target.kind === "long" && todosRef.current.todos.some((todo) => todo.parentLongId === id && todo.status === "open") && !window.confirm("完成长期目标后，未完成子项会保留为独立待办。继续 Punch？")) return;
    persistTodos(punchTodo(todosRef.current, id, Date.now(), makeId("punch"), makeId("segment"), running));
  };
  const restore = (id: string, joinSession: boolean) => {
    const target = todosRef.current.todos.find((todo) => todo.id === id);
    if (!target) return;
    const completedChildren = target.kind === "long" ? todosRef.current.todos.filter((todo) => todo.parentLongId === id && todo.status === "completed") : [];
    const restoreChildren = completedChildren.length > 0 && window.confirm(`是否同时恢复 ${completedChildren.length} 个已办子项？\n选择“取消”只恢复长期目标。`);
    let next = reopenTodo(todosRef.current, id, Date.now(), makeId("reopen"), joinSession, makeId("segment"), running);
    if (restoreChildren) for (const child of completedChildren) next = reopenTodo(next, child.id, Date.now(), makeId("reopen"), joinSession, makeId("segment"), running);
    persistTodos(next); setHistoryId(null); setTab("open");
  };

  const visible = todos.todos.filter((todo) => todo.status === tab && (filter === "all" || todo.kind === filter) && todo.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const recentPunch = todos.punches.slice().reverse().find((record) => record.undoneAt === null && now - record.punchedAt <= 5_000 && !todos.reopens.some((reopen) => reopen.todoId === record.todoId && reopen.reopenedAt > record.punchedAt));
  const historyTodo = todos.todos.find((todo) => todo.id === historyId) || null;

  return <main className={`todo-companion ${collapsed ? "collapsed" : ""}`}>
    <header className="todo-companion-header drag-region">
      <div><ListTodo size={15} /><strong>完整待办</strong></div>
      <div className="no-drag"><button className={following ? "following" : ""} onClick={() => void window.tomatoDesktop?.setTodoFollowing(!following)}>{following ? <Link size={12} /> : <Link2Off size={12} />}{following ? "已跟随" : "已分离"}</button><button aria-label={collapsed ? "展开待办窗口" : "收起待办窗口"} onClick={() => void window.tomatoDesktop?.toggleTodoCollapsed()}>{collapsed ? <Plus size={14} /> : <Minus size={14} />}</button><button aria-label="隐藏待办窗口" onClick={() => void window.tomatoDesktop?.hideTodoWindow()}><EyeOff size={14} /></button></div>
    </header>
    <nav className="todo-tabs no-drag"><button className={tab === "open" ? "active" : ""} onClick={() => setTab("open")}>待办 <span>{todos.todos.filter((todo) => todo.status === "open").length}</span></button><button className={tab === "completed" ? "active" : ""} onClick={() => setTab("completed")}>已办 <span>{todos.todos.filter((todo) => todo.status === "completed").length}</span></button></nav>
    {recentPunch && <div className="punch-undo no-drag" role="status"><Check size={14} /><span>已 Punch · {todos.todos.find((todo) => todo.id === recentPunch.todoId)?.title} · {formatElapsed(recentPunch.elapsedMs)}</span><button onClick={() => persistTodos(undoPunch(todosRef.current, recentPunch.id, Date.now(), makeId("segment"), running))}><Undo2 size={12} />撤销</button></div>}
    <div className="todo-toolbar no-drag"><label><Search size={13} /><input aria-label={`搜索${tab === "open" ? "待办" : "已办"}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${tab === "open" ? "待办" : "已办"}`} /></label><div>{(["all", "long", "short"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "全部" : value === "long" ? "长期" : "短期"}</button>)}</div></div>
    {tab === "open" && <>
      <section className="companion-session no-drag"><header><span><Clock3 size={13} />本轮待办</span><small>{todos.selectedIds.length} 项 · {running ? formatTime(remainingAt(timer, now)) : phaseLabel(timer)}</small></header><div>{todos.selectedIds.map((id) => todos.todos.find((todo) => todo.id === id && todo.status === "open")).filter((todo): todo is Todo => Boolean(todo)).map((todo) => <button key={todo.id} className={todo.id === todos.activeTodoId ? "active" : ""} onClick={() => mutateAttribution((state, at, segment, tracking) => switchActiveTodo(state, todo.id, at, segment, tracking))}>{todo.kind === "long" ? <Target size={10} /> : <ListTodo size={10} />}{todo.title}</button>)}</div></section>
      <section className="companion-create no-drag"><div><button className={kind === "short" ? "active" : ""} onClick={() => setKind("short")}>短期</button><button className={kind === "long" ? "active" : ""} onClick={() => setKind("long")}>长期</button></div><input value={title} maxLength={80} placeholder={`新建${kind === "long" ? "长期目标" : "短期待办"}`} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") add(); }} /><button onClick={add}><Plus size={13} />添加</button></section>
    </>}
    <section className="companion-list no-drag">
      {visible.map((todo) => {
        const selected = todos.selectedIds.includes(todo.id), active = todos.activeTodoId === todo.id;
        const elapsed = todo.kind === "long" ? elapsedForLongTodo(todos, todo.id, now) : elapsedForTodo(todos, todo.id, now);
        const lastPunch = todos.punches.filter((record) => record.todoId === todo.id && record.undoneAt === null).at(-1);
        return <article key={todo.id} className={`${selected ? "selected" : ""} ${active ? "active" : ""}`}>
          <button className="companion-check" aria-pressed={selected} disabled={tab === "completed" || running && active} onClick={() => mutateAttribution((state, at, segment, tracking) => toggleTodoSelection(state, todo.id, at, segment, tracking))}>{tab === "completed" || selected ? <Check size={12} /> : null}</button>
          <div className="companion-copy"><strong>{todo.title}</strong><span>{todo.kind === "long" ? "长期" : "短期"} · {tab === "completed" && lastPunch ? `${new Date(lastPunch.punchedAt).toLocaleDateString("zh-CN")} Punch · 本次 ${formatElapsed(lastPunch.elapsedMs)} · ` : ""}总计 {formatElapsed(elapsed)}{completionCount(todos, todo.id) ? ` · 完成 ${completionCount(todos, todo.id)} 次` : ""}</span></div>
          <div className="companion-actions">{tab === "open" ? <>{todo.kind === "long" ? <button onClick={() => mutateAttribution((state, at, segment, tracking) => switchLongTodo(state, todo.id, at, segment, tracking))}>{todos.activeLongId === todo.id ? "当前目标" : "设为目标"}</button> : selected && <button onClick={() => mutateAttribution((state, at, segment, tracking) => switchActiveTodo(state, todo.id, at, segment, tracking))}>{active ? "执行中" : "执行"}</button>}<button className="punch" onClick={() => punch(todo.id)}>Punch</button></> : <><button onClick={() => setHistoryId(todo.id)}><History size={11} />记录</button><button className="restore" onClick={() => restore(todo.id, false)}>恢复</button>{running && <button className="restore-session" onClick={() => restore(todo.id, true)}>加入本轮</button>}</>}</div>
        </article>;
      })}
      {visible.length === 0 && <div className="companion-empty"><ListTodo size={25} /><strong>{tab === "open" ? "没有符合条件的待办" : "Punch 完成的任务会保留在这里"}</strong><span>{tab === "open" ? "创建一项或调整筛选条件" : "已办不是删除，之后可以恢复为待办"}</span></div>}
    </section>
    <footer className="companion-footer"><span><i />窗口常驻 · 与计时器实时同步</span><strong>{following ? "已跟随主窗口" : "已临时分离"}</strong></footer>
    {historyTodo && <TodoHistoryPanel todo={historyTodo} state={todos} onClose={() => setHistoryId(null)} onRestore={(join) => restore(historyTodo.id, join)} />}
  </main>;
}

export default function App() {
  return new URLSearchParams(window.location.search).get("window") === "todo" ? <TodoCompanionApp /> : <TimerApp />;
}
