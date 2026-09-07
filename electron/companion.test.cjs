const test = require("node:test");
const assert = require("node:assert/strict");
const { companionBounds } = require("./companion.cjs");

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

test("places the todo companion below the main window when it fits", () => {
  const result = companionBounds({ x: 200, y: 100, width: 392, height: 270 }, workArea);
  assert.equal(result.placement, "below");
  assert.deepEqual(result.bounds, { x: 200, y: 378, width: 392, height: 570 });
});

test("flips the companion above near the bottom edge", () => {
  const result = companionBounds({ x: 200, y: 700, width: 392, height: 270 }, workArea);
  assert.equal(result.placement, "above");
  assert.equal(result.bounds.y, 122);
});

test("shrinks the companion on a short work area without leaving the screen", () => {
  const result = companionBounds({ x: 200, y: 100, width: 392, height: 270 }, { x: 0, y: 0, width: 1280, height: 720 });
  assert.equal(result.bounds.y + result.bounds.height <= 720, true);
  assert.equal(result.bounds.height, 342);
});
