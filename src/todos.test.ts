import { describe, expect, it } from "vitest";
import { addTodo, canDeleteTodo, deleteTodo, EMPTY_TODO_STATE, elapsedForLongTodo, elapsedForTodo, endTodoSession, punchTodo, reopenTodo, startTodoSession, switchActiveTodo, switchLongTodo, toggleTodoSelection, undoPunch } from "./todos";

describe("todo focus ledger", () => {
  it("permanently deletes only todos without history and detaches their children", () => {
    let state = addTodo(EMPTY_TODO_STATE, "long", "目标", "long", 0);
    state = switchLongTodo(state, "long", 0, "unused", false);
    state = addTodo(state, "short", "子项", "child", 1);
    expect(state.todos[1].parentLongId).toBe("long");
    expect(canDeleteTodo(state, "long")).toBe(true);
    state = deleteTodo(state, "long");
    expect(state.todos.map((todo) => todo.id)).toEqual(["child"]);
    expect(state.todos[0].parentLongId).toBeNull();
    expect(state.selectedIds).toEqual(["child"]);
  });

  it("logically deletes todos with history while retaining their ledger", () => {
    let state = addTodo(EMPTY_TODO_STATE, "short", "有记录", "a", 0);
    state = startTodoSession(state, 0, "session", "segment");
    state = endTodoSession(state, 60_000);
    expect(canDeleteTodo(state, "a")).toBe(false);
    state = deleteTodo(state, "a", 70_000);
    expect(state.todos.find((todo) => todo.id === "a")?.deletedAt).toBe(70_000);
    expect(state.segments).toHaveLength(1);
    expect(elapsedForTodo(state, "a")).toBe(60_000);
    expect(state.selectedIds).toEqual([]);
  });

  it("switches attribution when logically deleting the running todo", () => {
    let state = addTodo(EMPTY_TODO_STATE, "short", "当前", "a", 0);
    state = addTodo(state, "short", "下一项", "b", 0);
    state = startTodoSession(state, 0, "session", "segment-a");
    state = deleteTodo(state, "a", 60_000, "segment-b", true);
    expect(state.todos.find((todo) => todo.id === "a")?.deletedAt).toBe(60_000);
    expect(state.activeTodoId).toBe("b");
    expect(state.segments[0].endedAt).toBe(60_000);
    expect(state.segments.at(-1)?.todoId).toBe("b");
  });

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

  it("undoes a punch and restores the previous queue and active attribution", () => {
    let state = addTodo(EMPTY_TODO_STATE, "short", "短期", "a", 0);
    state = startTodoSession(state, 0, "session", "seg-a");
    state = punchTodo(state, "a", 60_000, "punch", "unused", true);
    state = undoPunch(state, "punch", 61_000, "seg-restored", true);
    expect(state.todos[0].status).toBe("open");
    expect(state.selectedIds).toEqual(["a"]);
    expect(state.activeTodoId).toBe("a");
    expect(state.punches[0].undoneAt).toBe(61_000);
    expect(state.segments.at(-1)?.todoId).toBe("a");
  });

  it("reopens a completed todo into a new cycle without losing history", () => {
    let state = addTodo(EMPTY_TODO_STATE, "short", "短期", "a", 0);
    state = startTodoSession(state, 0, "session", "seg-a");
    state = punchTodo(state, "a", 60_000, "punch-1", "unused", true);
    state = reopenTodo(state, "a", 100_000, "reopen", true, "seg-b", true);
    state = punchTodo(state, "a", 160_000, "punch-2", "unused", true);
    expect(state.punches).toHaveLength(2);
    expect(state.punches[1].elapsedMs).toBe(60_000);
    expect(state.punches[1].totalElapsedMs).toBe(120_000);
    expect(state.reopens).toHaveLength(1);
  });
});
