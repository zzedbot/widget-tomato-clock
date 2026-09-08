import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

async function expectWindowSize(electronApp: Awaited<ReturnType<typeof electron.launch>>, width: number, height: number, role: "main" | "todo" = "main") {
  await expect.poll(async () => {
    const [actualWidth, actualHeight] = await electronApp.evaluate(({ BrowserWindow }, targetRole) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes("window=todo") === (targetRole === "todo"));
      return window?.getSize() || [0, 0];
    }, role);
    return Math.abs(actualWidth - width) <= 2 && Math.abs(actualHeight - height) <= 2;
  }).toBe(true);
}

test("start collapses to mini and edge docking expands on hover", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "tomato-clock-e2e-"));
  const electronApp = await electron.launch({
    args: [path.resolve(".")],
    env: { ...process.env, TOMATO_E2E_USER_DATA: userData }
  });

  try {
    const page = await electronApp.firstWindow();
    await page.waitForSelector(".widget");
    await expect.poll(() => electronApp.windows().length).toBe(2);
    const todoPage = electronApp.windows().find((window) => window.url().includes("window=todo"));
    expect(todoPage).toBeTruthy();
    await todoPage!.waitForSelector(".todo-companion");

    await expectWindowSize(electronApp, 392, 270);
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => {
      const todo = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("window=todo"));
      if (!todo) return "missing";
      const [width, height] = todo.getSize();
      return `${width}x${height}`;
    })).toMatch(/^392x\d+$/);
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      const main = windows.find((window) => !window.webContents.getURL().includes("window=todo"));
      const todo = windows.find((window) => window.webContents.getURL().includes("window=todo"));
      if (!main || !todo || !todo.isVisible()) return "missing";
      const a = main.getBounds(), b = todo.getBounds();
      const gap = b.y >= a.y ? b.y - (a.y + a.height) : a.y - (b.y + b.height);
      return a.x === b.x && Math.abs(gap - 8) <= 1;
    })).toBe(true);
    await expect(page.locator(".system-clock")).toBeVisible();
    await expect(page.locator(".system-clock strong")).toHaveText(/^\d{2}:\d{2}$/);
    await todoPage!.getByRole("button", { name: "收起待办窗口" }).click();
    await expectWindowSize(electronApp, 392, 46, "todo");
    await todoPage!.getByRole("button", { name: "展开待办窗口" }).click();
    await expect(todoPage!.getByPlaceholder("新建短期待办")).toBeVisible();
    await todoPage!.getByPlaceholder("新建短期待办").fill("准备删除的待办");
    await todoPage!.getByRole("button", { name: "添加" }).click();
    const deleteConfirmation = todoPage!.waitForEvent("dialog");
    const deleteClick = todoPage!.getByRole("button", { name: "删除准备删除的待办" }).click();
    await (await deleteConfirmation).accept();
    await deleteClick;
    await expect(todoPage!.locator(".companion-list")).not.toContainText("准备删除的待办");
    await todoPage!.getByPlaceholder("新建短期待办").fill("验证边缘停靠");
    await todoPage!.getByRole("button", { name: "添加" }).click();
    await todoPage!.getByPlaceholder("新建短期待办").fill("检查本轮队列");
    await todoPage!.getByRole("button", { name: "添加" }).click();
    await expect(page.getByRole("button", { name: "开始专注", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "开始专注", exact: true }).click();
    await expect(page.locator(".mini-widget")).toBeVisible();
    await expectWindowSize(electronApp, 300, 86);
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("window=todo"))?.isVisible())).toBe(false);
    await expect(page.locator(".mini-meta time")).toHaveText(/^\d{2}\/\d{2} · \d{2}:\d{2}$/);

    await page.locator(".mini-widget").dblclick();
    await expect(page.locator(".widget")).toBeVisible();
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("window=todo"))?.isVisible())).toBe(true);
    await expect(page.locator(".session-queue")).toContainText("验证边缘停靠");
    await expect(page.locator(".session-queue")).toContainText("检查本轮队列");
    await page.getByRole("button", { name: "切换到检查本轮队列" }).click();
    await expect(page.getByRole("button", { name: "当前执行检查本轮队列" })).toHaveAttribute("aria-current", "true");
    await page.getByRole("button", { name: "切换到验证边缘停靠" }).click();

    const expectedDockTop = await electronApp.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.webContents.getURL().includes("window=todo"))!;
      // Use the desktop's outermost left display. Moving across an internal
      // monitor seam is normal cross-screen movement and must not dock.
      const workArea = screen.getAllDisplays().reduce((leftmost, display) =>
        display.workArea.x < leftmost.x ? display.workArea : leftmost,
      screen.getPrimaryDisplay().workArea);
      // Deliberately move well beyond its left edge. Overflow must still dock.
      window.emit("will-move");
      window.setPosition(workArea.x - 120, workArea.y + 160);
      return workArea.y + 160;
    });

    // Reaching the edge while the mouse button is still held must not alter
    // the window. The native moved event represents releasing the drag.
    await page.waitForTimeout(260);
    await expect(page.locator(".widget")).toBeVisible();
    await expectWindowSize(electronApp, 392, 270);
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => !window.webContents.getURL().includes("window=todo"))!.emit("moved"));

    await expect(page.locator(".edge-widget")).toBeVisible();
    await expectWindowSize(electronApp, 62, 62);
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("window=todo"))?.isVisible())).toBe(false);
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => !window.webContents.getURL().includes("window=todo"))!.getBounds().y)).toBe(expectedDockTop);
    await expect(page.locator(".edge-widget")).toHaveCSS("animation-duration", "0.24s");

    await page.mouse.move(500, 400);
    await page.waitForTimeout(260);
    await page.locator(".edge-widget").hover();
    await expect(page.locator(".widget")).toBeVisible();
    await expectWindowSize(electronApp, 392, 270);
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("window=todo"))?.isVisible())).toBe(true);
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => !window.webContents.getURL().includes("window=todo"))!.getBounds().y)).toBe(expectedDockTop);

    // A transient mouseleave during resize must not collapse a panel while
    // the real cursor is still inside it.
    await page.waitForTimeout(650);
    await expect(page.locator(".widget")).toBeVisible();
    await expectWindowSize(electronApp, 392, 270);

    await page.mouse.move(180, 130);
    await page.mouse.move(520, 400);
    await expectWindowSize(electronApp, 62, 62);

    await page.locator(".edge-widget").hover();
    await page.waitForTimeout(220);
    await electronApp.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.webContents.getURL().includes("window=todo"))!;
      const workArea = screen.getDisplayMatching(window.getBounds()).workArea;
      window.setPosition(workArea.x + 240, workArea.y + 180);
    });
    await page.mouse.move(180, 130);
    await page.mouse.move(520, 400);
    await page.waitForTimeout(650);
    await expectWindowSize(electronApp, 392, 270);

    await page.getByRole("button", { name: "Punch", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已 Punch · 验证边缘停靠");
    await todoPage!.getByRole("button", { name: /已办/ }).click();
    await expect(todoPage!.locator(".companion-list")).toContainText("验证边缘停靠");
    await todoPage!.getByRole("button", { name: "恢复", exact: true }).click();
    await expect(todoPage!.locator(".companion-list")).toContainText("验证边缘停靠");
    const logicalDeleteConfirmation = todoPage!.waitForEvent("dialog");
    const logicalDeleteClick = todoPage!.getByRole("button", { name: "删除检查本轮队列" }).click();
    await (await logicalDeleteConfirmation).accept();
    await logicalDeleteClick;
    await expect(todoPage!.locator(".companion-list")).not.toContainText("检查本轮队列");
    await expect(page.getByText("检查本轮队列", { exact: true })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("tomato-clock:todos:v1") || "{}");
      const deleted = state.todos?.find((todo: { title: string }) => todo.title === "检查本轮队列");
      return { punches: state.punches?.length || 0, logicallyDeleted: typeof deleted?.deletedAt === "number" };
    })).toEqual({ punches: 1, logicallyDeleted: true });
  } finally {
    await electronApp.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
