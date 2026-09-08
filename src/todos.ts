import type { PunchRecord, ReopenRecord, TimeSegment, Todo, TodoKind, TodoState } from "./types";

export const EMPTY_TODO_STATE: TodoState = {
  todos: [], selectedIds: [], activeTodoId: null, activeLongId: null,
  sessionId: null, segments: [], punches: [], reopens: []
};

export function normalizeTodoState(value?: Partial<TodoState>): TodoState {
  const state = { ...EMPTY_TODO_STATE, ...value };
  const openIds = new Set(state.todos.filter((todo) => todo.status === "open" && !todo.deletedAt).map((todo) => todo.id));
  const selectedIds = state.selectedIds.filter((id) => openIds.has(id));
  return {
    ...state,
    todos: state.todos.map((todo) => ({ ...todo, cycleStartedAt: todo.cycleStartedAt ?? todo.createdAt, deletedAt: todo.deletedAt ?? null })),
    selectedIds,
    activeTodoId: state.activeTodoId && openIds.has(state.activeTodoId) ? state.activeTodoId : null,
    activeLongId: state.activeLongId && openIds.has(state.activeLongId) ? state.activeLongId : null,
    segments: state.segments.map((segment) => ({ ...segment, endedAt: segment.endedAt ?? null })),
    punches: (state.punches || []).map((punch) => ({
      ...punch,
      totalElapsedMs: punch.totalElapsedMs ?? punch.elapsedMs,
      previousSelectedIds: punch.previousSelectedIds || [],
      previousActiveTodoId: punch.previousActiveTodoId ?? null,
      previousActiveLongId: punch.previousActiveLongId ?? null,
      detachedChildIds: punch.detachedChildIds || [],
      undoneAt: punch.undoneAt ?? null
    })),
    reopens: state.reopens || []
  };
}

export function addTodo(state: TodoState, kind: TodoKind, title: string, id: string, now = Date.now()): TodoState {
  const clean = title.trim();
  if (!clean) return state;
  const todo: Todo = { id, kind, title: clean, status: "open", parentLongId: kind === "short" ? state.activeLongId : null, createdAt: now, completedAt: null, cycleStartedAt: now, deletedAt: null };
  return { ...state, todos: [...state.todos, todo], selectedIds: [...state.selectedIds, id] };
}

export function canDeleteTodo(state: TodoState, todoId: string): boolean {
  return state.todos.some((todo) => todo.id === todoId) &&
    !state.segments.some((segment) => segment.todoId === todoId || segment.longTodoId === todoId) &&
    !state.punches.some((record) => record.todoId === todoId) &&
    !state.reopens.some((record) => record.todoId === todoId);
}

export function deleteTodo(state: TodoState, todoId: string, now = Date.now(), nextSegmentId = "", tracking = false): TodoState {
  const target = state.todos.find((todo) => todo.id === todoId && !todo.deletedAt);
  if (!target) return state;
  const permanent = canDeleteTodo(state, todoId);
  const affectsAttribution = state.activeTodoId === todoId || state.activeLongId === todoId;
  const base = tracking && affectsAttribution ? closeOpenSegment(state, now) : state;
  const selectedIds = base.selectedIds.filter((id) => id !== todoId);
  let next: TodoState = {
    ...base,
    todos: base.todos
      .filter((todo) => !permanent || todo.id !== todoId)
      .map((todo) => {
        if (todo.id === todoId) return { ...todo, deletedAt: now };
        return todo.parentLongId === todoId ? { ...todo, parentLongId: null } : todo;
      }),
    selectedIds,
    activeTodoId: base.activeTodoId === todoId ? null : base.activeTodoId,
    activeLongId: base.activeLongId === todoId ? null : base.activeLongId
  };
  if (!next.activeTodoId) next = { ...next, activeTodoId: chooseActive(next) };
  if (tracking && affectsAttribution && next.activeTodoId) next = openSegment(next, now, nextSegmentId);
  return next;
}

function closeOpenSegment(state: TodoState, now: number): TodoState {
  return { ...state, segments: state.segments.map((segment) => segment.endedAt === null ? { ...segment, endedAt: Math.max(segment.startedAt, now) } : segment) };
}

function chooseActive(state: TodoState): string | null {
  const selected = state.todos.filter((todo) => state.selectedIds.includes(todo.id) && todo.status === "open" && !todo.deletedAt);
  return selected.find((todo) => todo.kind === "short")?.id || selected[0]?.id || null;
}

function openSegment(state: TodoState, now: number, segmentId: string): TodoState {
  if (!state.sessionId || !state.activeTodoId) return state;
  const segment: TimeSegment = { id: segmentId, sessionId: state.sessionId, todoId: state.activeTodoId, longTodoId: state.activeLongId, startedAt: now, endedAt: null };
  return { ...state, segments: [...state.segments, segment] };
}

export function toggleTodoSelection(state: TodoState, todoId: string, now = Date.now(), segmentId = "", tracking = false): TodoState {
  if (!state.todos.some((todo) => todo.id === todoId && todo.status === "open" && !todo.deletedAt)) return state;
  const selected = state.selectedIds.includes(todoId);
  const attributionChanged = selected && (state.activeTodoId === todoId || state.activeLongId === todoId);
  const base = tracking && attributionChanged ? closeOpenSegment(state, now) : state;
  const selectedIds = selected ? base.selectedIds.filter((id) => id !== todoId) : [...base.selectedIds, todoId];
  const todo = base.todos.find((item) => item.id === todoId);
  let activeLongId = base.activeLongId;
  if (!selected && todo?.kind === "long" && !activeLongId) activeLongId = todoId;
  if (selected && activeLongId === todoId) activeLongId = null;
  let activeTodoId = selected && base.activeTodoId === todoId ? null : base.activeTodoId;
  let next: TodoState = { ...base, selectedIds, activeLongId, activeTodoId };
  if (!next.activeTodoId) {
    activeTodoId = chooseActive(next);
    next = { ...next, activeTodoId };
  }
  if (tracking && attributionChanged && next.activeTodoId) next = openSegment(next, now, segmentId);
  return next;
}

export function startTodoSession(state: TodoState, now: number, sessionId: string, segmentId: string): TodoState {
  if (state.selectedIds.length === 0) return state;
  const activeTodoId = state.activeTodoId && state.selectedIds.includes(state.activeTodoId) ? state.activeTodoId : chooseActive(state);
  const selectedLong = state.todos.find((todo) => todo.kind === "long" && state.selectedIds.includes(todo.id));
  const next = { ...state, sessionId: state.sessionId || sessionId, activeTodoId, activeLongId: state.activeLongId || selectedLong?.id || null };
  if (next.segments.some((segment) => segment.endedAt === null)) return next;
  return openSegment(next, now, segmentId);
}

export function pauseTodoSession(state: TodoState, now = Date.now()): TodoState { return closeOpenSegment(state, now); }
export function endTodoSession(state: TodoState, now = Date.now()): TodoState { return { ...closeOpenSegment(state, now), sessionId: null }; }

export function switchActiveTodo(state: TodoState, todoId: string, now: number, segmentId: string, tracking: boolean): TodoState {
  if (!state.selectedIds.includes(todoId)) return state;
  if (state.activeTodoId === todoId) return state;
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo || todo.status !== "open" || todo.deletedAt) return state;
  let next: TodoState = {
    ...closeOpenSegment(state, now),
    activeTodoId: todoId,
    activeLongId: todo?.kind === "long" ? todoId : state.activeLongId
  };
  if (tracking) next = openSegment(next, now, segmentId);
  return next;
}

export function switchLongTodo(state: TodoState, todoId: string, now: number, segmentId: string, tracking: boolean): TodoState {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo || todo.kind !== "long" || todo.status !== "open" || todo.deletedAt) return state;
  const selectedIds = state.selectedIds.includes(todoId) ? state.selectedIds : [...state.selectedIds, todoId];
  const active = state.todos.find((item) => item.id === state.activeTodoId);
  const activeTodoId = active?.kind === "long" ? todoId : state.activeTodoId;
  let next: TodoState = { ...closeOpenSegment(state, now), selectedIds, activeLongId: todoId, activeTodoId };
  if (tracking) next = openSegment(next, now, segmentId);
  return next;
}

export function elapsedForTodo(state: TodoState, todoId: string, now = Date.now()): number {
  return state.segments.reduce((sum, segment) => segment.todoId === todoId ? sum + Math.max(0, (segment.endedAt ?? now) - segment.startedAt) : sum, 0);
}

export function elapsedForLongTodo(state: TodoState, todoId: string, now = Date.now()): number {
  return state.segments.reduce((sum, segment) => segment.longTodoId === todoId || segment.todoId === todoId ? sum + Math.max(0, (segment.endedAt ?? now) - segment.startedAt) : sum, 0);
}

function elapsedForCycle(state: TodoState, todo: Todo, now: number): number {
  return state.segments.reduce((sum, segment) => {
    const belongs = todo.kind === "long" ? segment.longTodoId === todo.id || segment.todoId === todo.id : segment.todoId === todo.id;
    if (!belongs || segment.startedAt < todo.cycleStartedAt) return sum;
    return sum + Math.max(0, (segment.endedAt ?? now) - segment.startedAt);
  }, 0);
}

export function punchTodo(state: TodoState, todoId: string, now: number, punchId: string, nextSegmentId: string, tracking: boolean): TodoState {
  const punchedTodo = state.todos.find((todo) => todo.id === todoId && todo.status === "open" && !todo.deletedAt);
  if (!punchedTodo) return state;
  const affectsAttribution = state.activeTodoId === todoId || state.activeLongId === todoId;
  let next = tracking && affectsAttribution ? closeOpenSegment(state, now) : state;
  const totalElapsedMs = punchedTodo.kind === "long" ? elapsedForLongTodo(next, todoId, now) : elapsedForTodo(next, todoId, now);
  const detachedChildIds = punchedTodo.kind === "long" ? next.todos.filter((todo) => todo.parentLongId === todoId && todo.status === "open").map((todo) => todo.id) : [];
  const record: PunchRecord = {
    id: punchId, todoId, sessionId: next.sessionId, punchedAt: now,
    elapsedMs: elapsedForCycle(next, punchedTodo, now), totalElapsedMs,
    previousSelectedIds: state.selectedIds, previousActiveTodoId: state.activeTodoId,
    previousActiveLongId: state.activeLongId, detachedChildIds, undoneAt: null
  };
  next = {
    ...next,
    todos: next.todos.map((todo) => {
      if (todo.id === todoId) return { ...todo, status: "completed", completedAt: now };
      if (punchedTodo?.kind === "long" && todo.parentLongId === todoId) return { ...todo, parentLongId: null };
      return todo;
    }),
    selectedIds: next.selectedIds.filter((id) => id !== todoId),
    punches: [...next.punches, record],
    activeLongId: next.activeLongId === todoId ? null : next.activeLongId,
    activeTodoId: next.activeTodoId === todoId ? null : next.activeTodoId
  };
  if (!next.activeTodoId) next = { ...next, activeTodoId: chooseActive(next) };
  if (tracking && affectsAttribution && next.activeTodoId) next = openSegment(next, now, nextSegmentId);
  return next;
}

export function undoPunch(state: TodoState, punchId: string, now: number, segmentId: string, tracking: boolean): TodoState {
  const punch = state.punches.find((record) => record.id === punchId && record.undoneAt === null);
  if (!punch) return state;
  let next = tracking ? closeOpenSegment(state, now) : state;
  next = {
    ...next,
    todos: next.todos.map((todo) => {
      if (todo.id === punch.todoId) return { ...todo, status: "open", completedAt: null };
      if (punch.detachedChildIds.includes(todo.id)) return { ...todo, parentLongId: punch.todoId };
      return todo;
    }),
    selectedIds: punch.previousSelectedIds,
    activeTodoId: punch.previousActiveTodoId,
    activeLongId: punch.previousActiveLongId,
    punches: next.punches.map((record) => record.id === punchId ? { ...record, undoneAt: now } : record)
  };
  if (tracking && next.activeTodoId) next = openSegment(next, now, segmentId);
  return next;
}

export function reopenTodo(state: TodoState, todoId: string, now: number, reopenId: string, joinSession: boolean, segmentId: string, tracking: boolean): TodoState {
  const todo = state.todos.find((item) => item.id === todoId && item.status === "completed" && !item.deletedAt);
  if (!todo) return state;
  const selectedIds = joinSession && !state.selectedIds.includes(todoId) ? [...state.selectedIds, todoId] : state.selectedIds;
  const shouldActivate = joinSession && !state.activeTodoId;
  const record: ReopenRecord = { id: reopenId, todoId, reopenedAt: now, joinedSession: joinSession };
  let next: TodoState = {
    ...state,
    todos: state.todos.map((item) => item.id === todoId ? { ...item, status: "open", completedAt: null, cycleStartedAt: now } : item),
    selectedIds,
    activeTodoId: shouldActivate ? todoId : state.activeTodoId,
    activeLongId: shouldActivate && todo.kind === "long" ? todoId : state.activeLongId,
    reopens: [...state.reopens, record]
  };
  if (tracking && shouldActivate) next = openSegment(next, now, segmentId);
  return next;
}
