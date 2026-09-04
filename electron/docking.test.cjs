const test = require("node:test");
const assert = require("node:assert/strict");
const { collapsedBounds, expandedBounds, findDockEdge } = require("./docking.cjs");

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

test("detects the nearest screen edge inside the threshold", () => {
  assert.equal(findDockEdge({ x: 8, y: 300, width: 392, height: 270 }, workArea), "left");
  assert.equal(findDockEdge({ x: 500, y: 300, width: 392, height: 270 }, workArea), null);
});

test("collapses to a visible tomato at the right edge", () => {
  assert.deepEqual(
    collapsedBounds("right", { x: 1528, y: 300, width: 392, height: 270 }, workArea, 62),
    { x: 1858, y: 404, width: 62, height: 62 }
  );
});

test("expands inward without leaving the work area", () => {
  assert.deepEqual(
    expandedBounds("bottom", { x: 1800, y: 978, width: 62, height: 62 }, workArea, { width: 392, height: 270 }),
    { x: 1528, y: 770, width: 392, height: 270 }
  );
});
