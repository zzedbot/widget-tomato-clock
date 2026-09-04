// Electron returns BrowserWindow bounds and Display.workArea in device-independent
// pixels (DIP), so this threshold stays consistent across Windows DPI scales.
const EDGE_THRESHOLD = 32;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function containsPoint(bounds, point) {
  return point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height;
}

function findDockEdge(bounds, workArea, threshold = EDGE_THRESHOLD) {
  // A positive gap means the window is inside the work area. Zero means the
  // edges touch. A negative gap means that window edge is already outside.
  // Do not use Math.abs here: every negative gap must remain eligible.
  const gaps = [
    { edge: "left", gap: bounds.x - workArea.x },
    { edge: "right", gap: workArea.x + workArea.width - (bounds.x + bounds.width) },
    { edge: "top", gap: bounds.y - workArea.y },
    { edge: "bottom", gap: workArea.y + workArea.height - (bounds.y + bounds.height) }
  ];
  const candidates = gaps.filter(({ gap }) => gap <= threshold);
  if (candidates.length === 0) return null;

  // At a corner, a more negative gap represents the edge crossed further.
  // If all gaps are positive, the smallest gap is the nearest edge.
  candidates.sort((a, b) => a.gap - b.gap);
  return candidates[0].edge;
}

function collapsedBounds(edge, current, workArea, size) {
  const maxX = workArea.x + workArea.width - size;
  const maxY = workArea.y + workArea.height - size;
  if (edge === "left") return { x: workArea.x, y: clamp(current.y, workArea.y, maxY), width: size, height: size };
  if (edge === "right") return { x: maxX, y: clamp(current.y, workArea.y, maxY), width: size, height: size };
  if (edge === "top") return { x: clamp(current.x, workArea.x, maxX), y: workArea.y, width: size, height: size };
  return { x: clamp(current.x, workArea.x, maxX), y: maxY, width: size, height: size };
}

function expandedBounds(edge, current, workArea, size) {
  const maxX = workArea.x + workArea.width - size.width;
  const maxY = workArea.y + workArea.height - size.height;
  if (edge === "left") return { x: workArea.x, y: clamp(current.y, workArea.y, maxY), ...size };
  if (edge === "right") return { x: maxX, y: clamp(current.y, workArea.y, maxY), ...size };
  if (edge === "top") return { x: clamp(current.x, workArea.x, maxX), y: workArea.y, ...size };
  return { x: clamp(current.x, workArea.x, maxX), y: maxY, ...size };
}

module.exports = { EDGE_THRESHOLD, collapsedBounds, containsPoint, expandedBounds, findDockEdge };
