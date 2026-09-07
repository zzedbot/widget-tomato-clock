function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function companionBounds(mainBounds, workArea, preferredHeight = 570, gap = 8) {
  const width = mainBounds.width;
  const availableBelow = workArea.y + workArea.height - (mainBounds.y + mainBounds.height + gap);
  const availableAbove = mainBounds.y - workArea.y - gap;
  const placeBelow = availableBelow >= preferredHeight || availableBelow >= availableAbove;
  const available = Math.max(240, placeBelow ? availableBelow : availableAbove);
  const height = Math.min(preferredHeight, available, workArea.height - gap);
  const x = clamp(mainBounds.x, workArea.x, workArea.x + workArea.width - width);
  const y = placeBelow
    ? clamp(mainBounds.y + mainBounds.height + gap, workArea.y, workArea.y + workArea.height - height)
    : clamp(mainBounds.y - gap - height, workArea.y, workArea.y + workArea.height - height);
  return { bounds: { x, y, width, height }, placement: placeBelow ? "below" : "above" };
}

module.exports = { companionBounds };
