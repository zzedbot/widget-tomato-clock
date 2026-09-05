import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

async function expectWindowSize(electronApp: Awaited<ReturnType<typeof electron.launch>>, width: number, height: number) {
  await expect.poll(async () => {
    const [actualWidth, actualHeight] = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize());
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

    await expectWindowSize(electronApp, 392, 270);
    await expect(page.locator(".system-clock")).toBeVisible();
    await expect(page.locator(".system-clock strong")).toHaveText(/^\d{2}:\d{2}$/);
    await page.getByRole("button", { name: "选择待办开始" }).click();
    await expect(page.locator(".todo-panel")).toBeVisible();
    await expectWindowSize(electronApp, 460, 710);
    await page.getByPlaceholder("新建短期待办").fill("验证边缘停靠");
    await page.locator(".todo-create-row").getByRole("button", { name: "添加" }).click();
    await page.getByRole("button", { name: "完成选择" }).click();
    await expect(page.locator(".widget")).toBeVisible();
    await page.getByRole("button", { name: "开始专注", exact: true }).click();
    await expect(page.locator(".mini-widget")).toBeVisible();
    await expectWindowSize(electronApp, 300, 86);
    await expect(page.locator(".mini-meta time")).toHaveText(/^\d{2}\/\d{2} · \d{2}:\d{2}$/);

    await page.locator(".mini-widget").dblclick();
    await expect(page.locator(".widget")).toBeVisible();

    const expectedDockTop = await electronApp.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0];
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
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit("moved"));

    await expect(page.locator(".edge-widget")).toBeVisible();
    await expectWindowSize(electronApp, 62, 62);
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().y)).toBe(expectedDockTop);
    await expect(page.locator(".edge-widget")).toHaveCSS("animation-duration", "0.24s");

    await page.mouse.move(500, 400);
    await page.waitForTimeout(260);
    await page.locator(".edge-widget").hover();
    await expect(page.locator(".widget")).toBeVisible();
    await expectWindowSize(electronApp, 392, 270);
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().y)).toBe(expectedDockTop);

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
      const window = BrowserWindow.getAllWindows()[0];
      const workArea = screen.getDisplayMatching(window.getBounds()).workArea;
      window.setPosition(workArea.x + 240, workArea.y + 180);
    });
    await page.mouse.move(180, 130);
    await page.mouse.move(520, 400);
    await page.waitForTimeout(650);
    await expectWindowSize(electronApp, 392, 270);

    await page.getByRole("button", { name: "Punch", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已 Punch · 验证边缘停靠");
    await expect.poll(() => page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("tomato-clock:todos:v1") || "{}");
      return state.punches?.length || 0;
    })).toBe(1);
  } finally {
    await electronApp.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
