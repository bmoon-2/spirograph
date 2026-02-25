// =========================================================
// CONTOUR EXTRACTION — Moore neighbour tracing (single outer loop per blob)
// =========================================================

function extractContours(text) {
  const res = 400;
  const off = document.createElement('canvas');
  off.width = res; off.height = res;
  const octx = off.getContext('2d');

  octx.fillStyle = '#000';
  octx.fillRect(0, 0, res, res);
  octx.fillStyle = '#fff';
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';
  const fontSize = text.length === 1 ? res * 0.72 : text.length === 2 ? res * 0.52 : res * 0.38;
  octx.font = `bold ${fontSize}px "Helvetica Neue", Arial, sans-serif`;
  octx.fillText(text, res / 2, res / 2);

  const imgData = octx.getImageData(0, 0, res, res);
  const data = imgData.data;
  const filled = (x, y) => x >= 0 && x < res && y >= 0 && y < res && data[(y * res + x) * 4] > 128;

  // Moore-neighbour contour tracing.
  // Produces one ordered closed loop per connected foreground blob (outer boundary only).
  // Ref: "A Contour Tracing Algorithm" (Theo Pavlidis variant / Jacob's stopping criterion)

  // 8-neighbour offsets in clockwise order starting from "right"
  const DIRS = [
    { dx:  1, dy:  0 },
    { dx:  1, dy:  1 },
    { dx:  0, dy:  1 },
    { dx: -1, dy:  1 },
    { dx: -1, dy:  0 },
    { dx: -1, dy: -1 },
    { dx:  0, dy: -1 },
    { dx:  1, dy: -1 },
  ];

  // Find all foreground blobs by scanning and flood-filling
  const blobVisited = new Uint8Array(res * res);
  const blobs = []; // each blob: Set of pixel keys, plus topmost point

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      if (!filled(x, y) || blobVisited[y * res + x]) continue;
      // BFS flood-fill to collect blob pixels
      const blob = [];
      const queue = [[x, y]];
      blobVisited[y * res + x] = 1;
      while (queue.length) {
        const [cx, cy] = queue.shift();
        blob.push([cx, cy]);
        for (const { dx, dy } of DIRS) {
          const nx = cx + dx, ny = cy + dy;
          if (filled(nx, ny) && !blobVisited[ny * res + nx]) {
            blobVisited[ny * res + nx] = 1;
            queue.push([nx, ny]);
          }
        }
      }
      if (blob.length >= 30) blobs.push(blob);
    }
  }

  // For each blob, trace the outer contour using Moore neighbour tracing
  function traceOuterContour(blob) {
    // Build a fast lookup set
    const pixSet = new Set(blob.map(([x, y]) => y * res + x));
    const bfill = (x, y) => pixSet.has(y * res + x);

    // Start: topmost then leftmost pixel of blob
    let startX = blob[0][0], startY = blob[0][1];
    for (const [x, y] of blob) {
      if (y < startY || (y === startY && x < startX)) { startX = x; startY = y; }
    }

    const contour = [];
    let cx = startX, cy = startY;
    let prevDir = 6; // came from above (empty above topmost pixel)

    const maxSteps = blob.length * 4 + 8;
    // Track visited (position + entry direction) to detect when the loop closes
    const visitedStates = new Set();

    for (let steps = 0; steps < maxSteps; steps++) {
      // State = position + prevDir; if we revisit the same state, we've completed a loop
      const stateKey = (cx << 18) | (cy << 9) | prevDir;
      if (visitedStates.has(stateKey)) break;
      visitedStates.add(stateKey);

      contour.push({ x: cx, y: cy });

      // Search clockwise starting from backtrack direction (180° turn)
      let found = false;
      const startDir = (prevDir + 6) % 8;
      for (let k = 0; k < 8; k++) {
        const d = (startDir + k) % 8;
        const nx = cx + DIRS[d].dx;
        const ny = cy + DIRS[d].dy;
        if (bfill(nx, ny)) {
          prevDir = d;
          cx = nx;
          cy = ny;
          found = true;
          break;
        }
      }
      if (!found) break;
    }

    return contour;
  }

  const margin = 80;
  const scale = (Math.min(W, H) - margin * 2) / res;
  const ox = (W - res * scale) / 2;
  const oy = (H - res * scale) / 2;

  const result = [];
  for (const blob of blobs) {
    const contour = traceOuterContour(blob);
    if (contour.length < 20) continue;
    const scaled = contour.map(p => ({
      x: p.x * scale + ox,
      y: p.y * scale + oy
    }));
    result.push(smoothAndResample(scaled, Math.min(contour.length, 1200)));
  }
  return result;
}


function smoothAndResample(pts, numPoints) {
  if (pts.length < 4) return pts;

  // Smooth — more iterations and wider kernel for stable normals
  for (let iter = 0; iter < 12; iter++) {
    const s = [];
    for (let i = 0; i < pts.length; i++) {
      const p2 = pts[(i - 2 + pts.length) % pts.length];
      const p1 = pts[(i - 1 + pts.length) % pts.length];
      const c  = pts[i];
      const n1 = pts[(i + 1) % pts.length];
      const n2 = pts[(i + 2) % pts.length];
      s.push({
        x: p2.x * 0.05 + p1.x * 0.2 + c.x * 0.5 + n1.x * 0.2 + n2.x * 0.05,
        y: p2.y * 0.05 + p1.y * 0.2 + c.y * 0.5 + n1.y * 0.2 + n2.y * 0.05
      });
    }
    pts = s;
  }

  // Compute total length including closing segment
  let totalLen = 0;
  const lens = [0];
  for (let i = 1; i < pts.length; i++) {
    totalLen += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    lens.push(totalLen);
  }
  totalLen += Math.hypot(pts[0].x - pts[pts.length-1].x, pts[0].y - pts[pts.length-1].y);

  // Resample uniformly
  const step = totalLen / numPoints;
  const result = [];
  let ptIdx = 0;

  for (let i = 0; i < numPoints; i++) {
    const target = i * step;
    while (ptIdx < pts.length - 1 && lens[ptIdx + 1] < target) ptIdx++;
    if (ptIdx >= pts.length - 1) {
      const segStart = lens[pts.length - 1];
      const segLen = totalLen - segStart;
      const t = segLen > 0 ? (target - segStart) / segLen : 0;
      result.push({
        x: pts[pts.length-1].x + t * (pts[0].x - pts[pts.length-1].x),
        y: pts[pts.length-1].y + t * (pts[0].y - pts[pts.length-1].y)
      });
    } else {
      const segLen = lens[ptIdx+1] - lens[ptIdx];
      const t = segLen > 0 ? (target - lens[ptIdx]) / segLen : 0;
      result.push({
        x: pts[ptIdx].x + t * (pts[ptIdx+1].x - pts[ptIdx].x),
        y: pts[ptIdx].y + t * (pts[ptIdx+1].y - pts[ptIdx].y)
      });
    }
  }
  return result;
}
