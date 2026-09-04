const EDGE_THRESHOLD = 18;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function findDockEdge(bounds, workArea, threshold = EDGE_THRESHOLD) {
  const distances = {
    left: Math.abs(bounds.x - workArea.x),
    right: Math.abs(workArea.x + workArea.width - (bounds.x + bounds.width)),
    top: Math.abs(bounds.y - workArea.y),
    bottom: Math.abs(workArea.y + workArea.height - (bounds.y + bounds.height))
  };
  const [edge, distance] = Object.entries(distances).sort((a, b) => a[1] - b[1])[0];
  return distance <= threshold ? edge : null;
}

function collapsedBounds(edge, current, workArea, size) {
  const centerX = current.x + current.width / 2;
  const centerY = current.y + current.height / 2;
  const maxX = workArea.x + workArea.width - size;
  const maxY = workArea.y + workArea.height - size;
  if (edge === "left") return { x: workArea.x, y: clamp(Math.round(centerY - size / 2), workArea.y, maxY), width: size, height: size };
  if (edge === "right") return { x: maxX, y: clamp(Math.round(centerY - size / 2), workArea.y, maxY), width: size, height: size };
  if (edge === "top") return { x: clamp(Math.round(centerX - size / 2), workArea.x, maxX), y: workArea.y, width: size, height: size };
  return { x: clamp(Math.round(centerX - size / 2), workArea.x, maxX), y: maxY, width: size, height: size };
}

function expandedBounds(edge, current, workArea, size) {
  const centerX = current.x + current.width / 2;
  const centerY = current.y + current.height / 2;
  const maxX = workArea.x + workArea.width - size.width;
  const maxY = workArea.y + workArea.height - size.height;
  if (edge === "left") return { x: workArea.x, y: clamp(Math.round(centerY - size.height / 2), workArea.y, maxY), ...size };
  if (edge === "right") return { x: maxX, y: clamp(Math.round(centerY - size.height / 2), workArea.y, maxY), ...size };
  if (edge === "top") return { x: clamp(Math.round(centerX - size.width / 2), workArea.x, maxX), y: workArea.y, ...size };
  return { x: clamp(Math.round(centerX - size.width / 2), workArea.x, maxX), y: maxY, ...size };
}

module.exports = { EDGE_THRESHOLD, collapsedBounds, expandedBounds, findDockEdge };
