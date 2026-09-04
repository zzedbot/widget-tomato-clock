const test = require("node:test");
const assert = require("node:assert/strict");
const { collapsedBounds, containsPoint, expandedBounds, findDockEdge } = require("./docking.cjs");

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

test("detects every work-area edge inside the threshold", () => {
  assert.equal(findDockEdge({ x: 20, y: 300, width: 392, height: 270 }, workArea), "left");
  assert.equal(findDockEdge({ x: 1500, y: 300, width: 392, height: 270 }, workArea), "right");
  assert.equal(findDockEdge({ x: 700, y: 24, width: 392, height: 270 }, workArea), "top");
  assert.equal(findDockEdge({ x: 700, y: 744, width: 392, height: 270 }, workArea), "bottom");
  assert.equal(findDockEdge({ x: 500, y: 300, width: 392, height: 270 }, workArea), null);
});

test("docks when any window edge has crossed outside the work area", () => {
  assert.equal(findDockEdge({ x: -140, y: 300, width: 392, height: 270 }, workArea), "left");
  assert.equal(findDockEdge({ x: 1810, y: 300, width: 392, height: 270 }, workArea), "right");
  assert.equal(findDockEdge({ x: 700, y: -90, width: 392, height: 270 }, workArea), "top");
  assert.equal(findDockEdge({ x: 700, y: 980, width: 392, height: 270 }, workArea), "bottom");
});

test("uses the deepest crossing to resolve a corner", () => {
  assert.equal(findDockEdge({ x: -80, y: -20, width: 392, height: 270 }, workArea), "left");
  assert.equal(findDockEdge({ x: -10, y: -70, width: 392, height: 270 }, workArea), "top");
});

test("checks the real cursor against the expanded window bounds", () => {
  const bounds = { x: 100, y: 200, width: 392, height: 270 };
  assert.equal(containsPoint(bounds, { x: 100, y: 200 }), true);
  assert.equal(containsPoint(bounds, { x: 491, y: 469 }), true);
  assert.equal(containsPoint(bounds, { x: 492, y: 300 }), false);
  assert.equal(containsPoint(bounds, { x: 300, y: 470 }), false);
});

test("collapses to a visible tomato at the right edge", () => {
  assert.deepEqual(
    collapsedBounds("right", { x: 1528, y: 300, width: 392, height: 270 }, workArea, 62),
    { x: 1858, y: 300, width: 62, height: 62 }
  );
});

test("keeps the window top aligned when docking to a side", () => {
  assert.equal(collapsedBounds("left", { x: -40, y: 318, width: 392, height: 270 }, workArea, 62).y, 318);
  assert.equal(collapsedBounds("right", { x: 1580, y: 318, width: 392, height: 270 }, workArea, 62).y, 318);
  assert.equal(expandedBounds("left", { x: 0, y: 318, width: 62, height: 62 }, workArea, { width: 392, height: 270 }).y, 318);
  assert.equal(expandedBounds("right", { x: 1858, y: 318, width: 62, height: 62 }, workArea, { width: 392, height: 270 }).y, 318);
});

test("expands inward without leaving the work area", () => {
  assert.deepEqual(
    expandedBounds("bottom", { x: 1800, y: 978, width: 62, height: 62 }, workArea, { width: 392, height: 270 }),
    { x: 1528, y: 770, width: 392, height: 270 }
  );
});
