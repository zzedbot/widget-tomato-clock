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
    await page.getByRole("button", { name: "开始专注" }).click();
    await expect(page.locator(".mini-widget")).toBeVisible();
    await expectWindowSize(electronApp, 300, 86);

    await page.locator(".mini-widget").dblclick();
    await expect(page.locator(".widget")).toBeVisible();

    await electronApp.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0];
      // Use the desktop's outermost left display. Moving across an internal
      // monitor seam is normal cross-screen movement and must not dock.
      const workArea = screen.getAllDisplays().reduce((leftmost, display) =>
        display.workArea.x < leftmost.x ? display.workArea : leftmost,
      screen.getPrimaryDisplay().workArea);
      // Deliberately move well beyond its left edge. Overflow must still dock.
      window.setPosition(workArea.x - 120, workArea.y + 160);
    });
    await expect(page.locator(".edge-widget")).toBeVisible();
    await expectWindowSize(electronApp, 62, 62);

    await page.mouse.move(500, 400);
    await page.waitForTimeout(260);
    await page.locator(".edge-widget").hover();
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
  } finally {
    await electronApp.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
