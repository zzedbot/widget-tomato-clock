import type { PunchRecord, TimeSegment, Todo, TodoKind, TodoState } from "./types";

export const EMPTY_TODO_STATE: TodoState = {
  todos: [], selectedIds: [], activeTodoId: null, activeLongId: null,
  sessionId: null, segments: [], punches: []
};

export function normalizeTodoState(value?: Partial<TodoState>): TodoState {
  const state = { ...EMPTY_TODO_STATE, ...value };
  const openIds = new Set(state.todos.filter((todo) => todo.status === "open").map((todo) => todo.id));
  const selectedIds = state.selectedIds.filter((id) => openIds.has(id));
  return {
    ...state,
    selectedIds,
    activeTodoId: state.activeTodoId && openIds.has(state.activeTodoId) ? state.activeTodoId : null,
    activeLongId: state.activeLongId && openIds.has(state.activeLongId) ? state.activeLongId : null,
    segments: state.segments.map((segment) => ({ ...segment, endedAt: segment.endedAt ?? null })),
    punches: state.punches || []
  };
}

export function addTodo(state: TodoState, kind: TodoKind, title: string, id: string, now = Date.now()): TodoState {
  const clean = title.trim();
  if (!clean) return state;
  const todo: Todo = { id, kind, title: clean, status: "open", parentLongId: kind === "short" ? state.activeLongId : null, createdAt: now, completedAt: null };
  return { ...state, todos: [...state.todos, todo], selectedIds: [...state.selectedIds, id] };
}

function closeOpenSegment(state: TodoState, now: number): TodoState {
  return { ...state, segments: state.segments.map((segment) => segment.endedAt === null ? { ...segment, endedAt: Math.max(segment.startedAt, now) } : segment) };
}

function chooseActive(state: TodoState): string | null {
  const selected = state.todos.filter((todo) => state.selectedIds.includes(todo.id) && todo.status === "open");
  return selected.find((todo) => todo.kind === "short")?.id || selected[0]?.id || null;
}

function openSegment(state: TodoState, now: number, segmentId: string): TodoState {
  if (!state.sessionId || !state.activeTodoId) return state;
  const segment: TimeSegment = { id: segmentId, sessionId: state.sessionId, todoId: state.activeTodoId, longTodoId: state.activeLongId, startedAt: now, endedAt: null };
  return { ...state, segments: [...state.segments, segment] };
}

export function toggleTodoSelection(state: TodoState, todoId: string, now = Date.now(), segmentId = "", tracking = false): TodoState {
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
  if (!todo || todo.kind !== "long" || todo.status !== "open") return state;
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

export function punchTodo(state: TodoState, todoId: string, now: number, punchId: string, nextSegmentId: string, tracking: boolean): TodoState {
  let next = closeOpenSegment(state, now);
  const punchedTodo = next.todos.find((todo) => todo.id === todoId);
  const elapsedMs = punchedTodo?.kind === "long" ? elapsedForLongTodo(next, todoId, now) : elapsedForTodo(next, todoId, now);
  const record: PunchRecord = { id: punchId, todoId, sessionId: next.sessionId, punchedAt: now, elapsedMs };
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
  if (tracking && next.activeTodoId) next = openSegment(next, now, nextSegmentId);
  return next;
}
