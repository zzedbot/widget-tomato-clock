import { describe, expect, it } from "vitest";
import { addTodo, EMPTY_TODO_STATE, elapsedForLongTodo, elapsedForTodo, endTodoSession, punchTodo, startTodoSession, switchActiveTodo, switchLongTodo, toggleTodoSelection } from "./todos";

describe("todo focus ledger", () => {
  it("requires a selected todo before opening a session", () => {
    expect(startTodoSession(EMPTY_TODO_STATE, 0, "s", "g").sessionId).toBeNull();
  });

  it("attributes each wall-clock interval to one direct todo and rolls it up to the long context", () => {
    let state = addTodo(EMPTY_TODO_STATE, "long", "长期", "long", 0);
    state = addTodo(state, "short", "短期一", "a", 0);
    state = addTodo(state, "short", "短期二", "b", 0);
    state = switchLongTodo(state, "long", 0, "unused", false);
    state = startTodoSession(state, 0, "session", "seg-a");
    state = switchActiveTodo(state, "b", 600_000, "seg-b", true);
    state = endTodoSession(state, 900_000);
    expect(elapsedForTodo(state, "a", 900_000)).toBe(600_000);
    expect(elapsedForTodo(state, "b", 900_000)).toBe(300_000);
    expect(elapsedForLongTodo(state, "long", 900_000)).toBe(900_000);
  });

  it("punches the active todo and advances to the next selected item", () => {
    let state = addTodo(EMPTY_TODO_STATE, "short", "一", "a", 0);
    state = addTodo(state, "short", "二", "b", 0);
    state = startTodoSession(state, 0, "session", "seg-a");
    state = punchTodo(state, "a", 300_000, "punch", "seg-b", true);
    expect(state.todos.find((todo) => todo.id === "a")?.status).toBe("completed");
    expect(state.punches[0].elapsedMs).toBe(300_000);
    expect(state.activeTodoId).toBe("b");
    expect(state.segments.at(-1)?.todoId).toBe("b");
  });

  it("switches direct attribution when a long todo is the active item", () => {
    let state = addTodo(EMPTY_TODO_STATE, "long", "一", "a", 0);
    state = addTodo(state, "long", "二", "b", 0);
    state = startTodoSession(state, 0, "session", "seg-a");
    state = switchLongTodo(state, "b", 60_000, "seg-b", true);
    expect(state.activeTodoId).toBe("b");
    expect(state.segments.at(-1)?.todoId).toBe("b");
  });

  it("splits the ledger when the current long context is deselected", () => {
    let state = addTodo(EMPTY_TODO_STATE, "long", "长期", "long", 0);
    state = addTodo(state, "short", "短期", "short", 0);
    state = startTodoSession(state, 0, "session", "seg-a");
    state = toggleTodoSelection(state, "long", 60_000, "seg-b", true);
    expect(state.activeLongId).toBeNull();
    expect(state.segments[0].endedAt).toBe(60_000);
    expect(state.segments.at(-1)?.longTodoId).toBeNull();
  });

  it("records rolled-up time and detaches open children when a long todo is punched", () => {
    let state = addTodo(EMPTY_TODO_STATE, "long", "长期", "long", 0);
    state = addTodo(state, "short", "短期", "short", 0);
    state = startTodoSession(state, 0, "session", "seg-a");
    state = punchTodo(state, "long", 120_000, "punch", "seg-b", true);
    expect(state.punches[0].elapsedMs).toBe(120_000);
    expect(state.todos.find((todo) => todo.id === "short")?.parentLongId).toBeNull();
  });
});
