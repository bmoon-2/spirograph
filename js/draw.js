// =========================================================
// DRAW
// =========================================================

function buildShapeMaskPath(contours) {
  const path = new Path2D();
  for (let ci = 0; ci < contours.length; ci++) {
    const c = contours[ci];
    if (!c || c.length < 2) continue;
    path.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < c.length; i++) path.lineTo(c[i].x, c[i].y);
    path.closePath();
  }
  return path;
}

function buildTextInsideTester(text) {
  const res = 400;
  const off = document.createElement('canvas');
  off.width = res;
  off.height = res;
  const octx = off.getContext('2d');
  octx.fillStyle = '#000';
  octx.fillRect(0, 0, res, res);
  octx.fillStyle = '#fff';
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';
  const fontSize = text.length === 1 ? res * 0.72 : text.length === 2 ? res * 0.52 : res * 0.38;
  octx.font = `bold ${fontSize}px "Helvetica Neue", Arial, sans-serif`;
  octx.fillText(text, res / 2, res / 2);
  const img = octx.getImageData(0, 0, res, res).data;
  const filled = new Uint8Array(res * res);
  for (let i = 0; i < res * res; i++) {
    filled[i] = img[i * 4] > 128 ? 1 : 0;
  }

  // Slight dilation closes tiny gaps so narrow internal channels are treated as inside.
  const dilateR = 2;
  const solid = new Uint8Array(res * res);
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      let on = 0;
      for (let dy = -dilateR; dy <= dilateR && !on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= res) continue;
        for (let dx = -dilateR; dx <= dilateR; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= res) continue;
          if (filled[yy * res + xx]) { on = 1; break; }
        }
      }
      solid[y * res + x] = on;
    }
  }

  // Mark background pixels connected to canvas border (true "outside" region).
  const outsideBg = new Uint8Array(res * res);
  const qx = new Int32Array(res * res);
  const qy = new Int32Array(res * res);
  let head = 0, tail = 0;
  const push = (x, y) => {
    const idx = y * res + x;
    if (outsideBg[idx] || solid[idx]) return;
    outsideBg[idx] = 1;
    qx[tail] = x;
    qy[tail] = y;
    tail++;
  };
  for (let x = 0; x < res; x++) { push(x, 0); push(x, res - 1); }
  for (let y = 1; y < res - 1; y++) { push(0, y); push(res - 1, y); }
  while (head < tail) {
    const x = qx[head];
    const y = qy[head];
    head++;
    if (x > 0) push(x - 1, y);
    if (x + 1 < res) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < res) push(x, y + 1);
  }

  const margin = 80;
  const scale = (Math.min(W, H) - margin * 2) / res;
  const ox = (W - res * scale) / 2;
  const oy = (H - res * scale) / 2;

  return function isInside(x, y) {
    const rx = (x - ox) / scale;
    const ry = (y - oy) / scale;
    const ix = rx | 0;
    const iy = ry | 0;
    if (ix < 0 || ix >= res || iy < 0 || iy >= res) return false;
    // Disallow non-outside area: filled glyph + enclosed holes.
    return outsideBg[iy * res + ix] === 0;
  };
}

function buildContourInsideTester(contours) {
  const w = W | 0;
  const h = H | 0;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  octx.clearRect(0, 0, w, h);
  octx.strokeStyle = '#fff';
  octx.lineWidth = 2.2;
  octx.lineJoin = 'round';
  octx.lineCap = 'round';
  for (let ci = 0; ci < contours.length; ci++) {
    const c = contours[ci];
    if (!c || c.length < 2) continue;
    octx.beginPath();
    octx.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < c.length; i++) octx.lineTo(c[i].x, c[i].y);
    octx.closePath();
    octx.stroke();
  }

  const img = octx.getImageData(0, 0, w, h).data;
  const wall = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) wall[i] = img[i * 4 + 3] > 64 ? 1 : 0;

  // Lightly dilate contour walls so tiny anti-aliased gaps do not leak flood fill.
  const wall2 = wall.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (wall[idx]) continue;
      let nearWall = false;
      for (let dy = -1; dy <= 1 && !nearWall; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (wall[(y + dy) * w + (x + dx)]) { nearWall = true; break; }
        }
      }
      if (nearWall) wall2[idx] = 1;
    }
  }

  const outside = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  const push = (x, y) => {
    const idx = y * w + x;
    if (outside[idx] || wall2[idx]) return;
    outside[idx] = 1;
    q[tail++] = idx;
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { push(0, y); push(w - 1, y); }
  while (head < tail) {
    const idx = q[head++];
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x + 1 < w) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < h) push(x, y + 1);
  }

  return function isInside(x, y) {
    const ix = x | 0;
    const iy = y | 0;
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) return false;
    return outside[iy * w + ix] === 0;
  };
}

function buildShapeInsideTester(text, contours) {
  const byContour = buildContourInsideTester(contours);
  if (contourSource !== 'text') return byContour;
  const byText = buildTextInsideTester(text || '');
  return (x, y) => byContour(x, y) || byText(x, y);
}

function minDistToContours(contours, x, y) {
  let minD = Infinity;
  for (let ci = 0; ci < contours.length; ci++) {
    const c = contours[ci];
    const n = c.length;
    for (let i = 0; i < n; i++) {
      const a = c[i];
      const b = c[(i + 1) % n];
      const d = pointSegDist(x, y, a.x, a.y, b.x, b.y);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

function segmentStaysOutsideShape(isInsideShape, contours, x1, y1, x2, y2, gearR, penD) {
  // Reject obvious jump lines first.
  const jump = Math.hypot(x2 - x1, y2 - y1);
  const jumpLimit = Math.max(26, gearR * 1.35, penD * 1.2);
  if (jump > jumpLimit) return false;

  // For outer-only drawing: reject segment only when it is clearly inside fill
  // (not just touching boundary / antialias fringe).
  const ts = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const insideMargin = Math.max(1.0, gearR * 0.04);
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (!isInsideShape(x, y)) continue;
    const d = minDistToContours(contours, x, y);
    if (d > insideMargin) return false;
  }

  return true;
}

function pointStaysOutsideShape(isInsideShape, contours, x, y, gearR) {
  if (!isInsideShape(x, y)) return true;
  const insideMargin = Math.max(1.0, gearR * 0.04);
  return minDistToContours(contours, x, y) <= insideMargin;
}

function buildContactRollingData(contour, gearR, outSign) {
  const n = contour.length;
  const normals = new Array(n);
  const centers = new Array(n);
  const segLens = new Array(n);
  const cum = new Array(n + 1);
  cum[0] = 0;

  for (let i = 0; i < n; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    segLens[i] = len;
    cum[i + 1] = cum[i] + len;

    let nx, ny;
    if (len > 1e-6) {
      nx = outSign * (-dy / len);
      ny = outSign * ( dx / len);
    } else {
      const nrm = getOutwardNormal(contour, i, outSign);
      nx = nrm.x;
      ny = nrm.y;
    }
    normals[i] = { x: nx, y: ny };
    centers[i] = { gcx: a.x + nx * gearR, gcy: a.y + ny * gearR };
  }

  return { normals, centers, segLens, cum, totalLen: cum[n] };
}

function computeContactBlockedIndices(centers, contour, allContours, contourIndex, gearR) {
  const n = contour.length;
  const blocked = new Array(n).fill(false);
  const localSkip = 6;
  const threshold = Math.max(0, gearR - 1.0);
  const centroid = getCentroid(contour);
  const radial = new Array(n);
  let minRad = Infinity;
  let maxRad = 0;

  for (let i = 0; i < n; i++) {
    const dx = centers[i].gcx - centroid.x;
    const dy = centers[i].gcy - centroid.y;
    const r = Math.hypot(dx, dy);
    radial[i] = r;
    if (r < minRad) minRad = r;
    if (r > maxRad) maxRad = r;
  }

  for (let i = 0; i < n; i++) {
    const px = centers[i].gcx;
    const py = centers[i].gcy;
    let minDist = Infinity;

    for (let ci = 0; ci < allContours.length; ci++) {
      const c = allContours[ci];
      const cn = c.length;
      for (let j = 0; j < cn; j++) {
        if (ci === contourIndex) {
          const d = Math.abs(j - i);
          const cd = Math.min(d, n - d);
          if (cd <= localSkip) continue;
        }
        const a = c[j];
        const b = c[(j + 1) % cn];
        const dist = pointSegDist(px, py, a.x, a.y, b.x, b.y);
        if (dist < minDist) minDist = dist;
      }
    }

    blocked[i] = minDist < threshold;
  }

  function collectRuns(blockedArr) {
    const allowed = blockedArr.map(v => !v);
    const runs = [];
    let i = 0;
    while (i < n) {
      if (!allowed[i]) { i++; continue; }
      let j = i;
      while (j < n && allowed[j]) j++;
      runs.push({ start: i, len: j - i, meanR: 0 });
      i = j;
    }
    if (runs.length > 1 && allowed[0] && allowed[n - 1]) {
      runs[0].start = runs[runs.length - 1].start;
      runs[0].len += runs[runs.length - 1].len;
      runs.pop();
    }
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      let sum = 0;
      for (let k = 0; k < run.len; k++) {
        const idx = (run.start + k) % n;
        sum += radial[idx];
      }
      run.meanR = sum / Math.max(1, run.len);
    }
    return runs;
  }

  // Outer-shell preference:
  // If radius spread is large (concave glyphs), suppress low-radius runs so
  // the gear stays on the exterior branch instead of jumping into inner lobes.
  const radialSpread = maxRad - minRad;
  const baseRuns = collectRuns(blocked);
  // Deep single-notch shapes (e.g. V): trim only the very bottom of the notch
  // so the path does not dive into the center cusp.
  if (baseRuns.length === 1 && minRad < maxRad * 0.05) {
    const apexCut = maxRad * 0.25;
    for (let i = 0; i < n; i++) {
      if (radial[i] < apexCut) blocked[i] = true;
    }
  }

  if (baseRuns.length >= 3 && radialSpread > gearR * 1.25) {
    let maxBaseMeanR = 0;
    let minBaseMeanR = Infinity;
    for (let r = 0; r < baseRuns.length; r++) {
      const mr = baseRuns[r].meanR;
      if (mr > maxBaseMeanR) maxBaseMeanR = mr;
      if (mr < minBaseMeanR) minBaseMeanR = mr;
    }
    // Apply only when there are clearly inner branches.
    if (minBaseMeanR < maxBaseMeanR * 0.6) {
      const shellCut = maxRad * 0.64;
      for (let i = 0; i < n; i++) {
        if (radial[i] < shellCut) blocked[i] = true;
      }
    }
  }

  // Keep outer runs preferentially: remove low-radius interior branches.
  const runs = collectRuns(blocked);
  if (runs.length > 1) {
    let maxMeanR = 0;
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      if (run.meanR > maxMeanR) maxMeanR = run.meanR;
    }
    const keepR = maxMeanR * 0.72;
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      const keep = run.meanR >= keepR || run.len >= 120;
      if (keep) continue;
      for (let k = 0; k < run.len; k++) blocked[(run.start + k) % n] = true;
    }
  }

  return blocked;
}

function buildContinuousRollTrack(contour, roll, blocked, gearR) {
  const n = contour.length;
  if (n < 3 || typeof ClipperLib === 'undefined') {
    return { fence: [], centers: [], normals: [], segLens: [], cum: [0], totalLen: 0 };
  }

  const centroid = getCentroid(contour);
  const scale = 128;
  let path = contour.map(p => ({
    X: Math.round(p.x * scale),
    Y: Math.round(p.y * scale),
  }));

  path = ClipperLib.Clipper.CleanPolygon(path, Math.max(1, Math.round(scale * 0.08)));
  if (!path || path.length < 3) {
    return { fence: [], centers: [], normals: [], segLens: [], cum: [0], totalLen: 0 };
  }

  // Keep the input orientation stable so positive delta offsets toward the
  // geometric outside for a single outer contour.
  if (!ClipperLib.Clipper.Orientation(path)) path = path.slice().reverse();

  const co = new ClipperLib.ClipperOffset(
    2,
    Math.max(1, Math.round(scale * 0.08))
  );
  co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const solution = new ClipperLib.Paths();
  co.Execute(solution, Math.round(gearR * scale));

  if (!solution.length) {
    return { fence: [], centers: [], normals: [], segLens: [], cum: [0], totalLen: 0 };
  }

  function pathArea(poly) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      area += a.X * b.Y - b.X * a.Y;
    }
    return area * 0.5;
  }

  let best = solution[0];
  let bestArea = Math.abs(pathArea(best));
  for (let i = 1; i < solution.length; i++) {
    const area = Math.abs(pathArea(solution[i]));
    if (area > bestArea) {
      best = solution[i];
      bestArea = area;
    }
  }

  best = ClipperLib.Clipper.CleanPolygon(best, Math.max(1, Math.round(scale * 0.06)));
  if (!best || best.length < 3) {
    return { fence: [], centers: [], normals: [], segLens: [], cum: [0], totalLen: 0 };
  }

  function resampleClosedCenters(points, count) {
    const m = points.length;
    const segLens = new Array(m);
    const cum = new Array(m + 1);
    cum[0] = 0;
    for (let i = 0; i < m; i++) {
      const a = points[i];
      const b = points[(i + 1) % m];
      const len = Math.hypot(b.gcx - a.gcx, b.gcy - a.gcy);
      segLens[i] = len;
      cum[i + 1] = cum[i] + len;
    }
    const totalLen = cum[m];
    if (totalLen <= 1e-6) return points.slice();
    const step = totalLen / count;
    const out = [];
    let segIdx = 0;
    for (let i = 0; i < count; i++) {
      const target = i * step;
      while (segIdx < m - 1 && cum[segIdx + 1] < target) segIdx++;
      const len = segLens[segIdx] || 1e-6;
      const t = (target - cum[segIdx]) / len;
      const a = points[segIdx];
      const b = points[(segIdx + 1) % m];
      out.push({
        gcx: a.gcx + (b.gcx - a.gcx) * t,
        gcy: a.gcy + (b.gcy - a.gcy) * t,
      });
    }
    return out;
  }

  function chaikinClosedCenters(points, iterations) {
    let pts = points.slice();
    for (let iter = 0; iter < iterations; iter++) {
      if (pts.length < 3) break;
      const next = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        next.push({
          gcx: a.gcx * 0.75 + b.gcx * 0.25,
          gcy: a.gcy * 0.75 + b.gcy * 0.25,
        });
        next.push({
          gcx: a.gcx * 0.25 + b.gcx * 0.75,
          gcy: a.gcy * 0.25 + b.gcy * 0.75,
        });
      }
      pts = next;
    }
    return pts;
  }

  function minDistToContour(x, y) {
    let minD = Infinity;
    for (let i = 0; i < n; i++) {
      const a = contour[i];
      const b = contour[(i + 1) % n];
      const d = pointSegDist(x, y, a.x, a.y, b.x, b.y);
      if (d < minD) minD = d;
    }
    return minD;
  }

  let centers = best.map(p => ({
    gcx: p.X / scale,
    gcy: p.Y / scale,
  }));

  centers = chaikinClosedCenters(centers, 1);
  centers = resampleClosedCenters(centers, Math.max(260, Math.min(1100, contour.length)));

  const m = centers.length;
  const normals = new Array(m);
  const fence = new Array(m);
  for (let i = 0; i < m; i++) {
    const p = centers[(i - 1 + m) % m];
    const c = centers[i];
    const q = centers[(i + 1) % m];
    const dx = q.gcx - p.gcx;
    const dy = q.gcy - p.gcy;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;

    const candidateA = { x: c.gcx - nx * gearR, y: c.gcy - ny * gearR };
    const candidateB = { x: c.gcx + nx * gearR, y: c.gcy + ny * gearR };
    const dA = minDistToContour(candidateA.x, candidateA.y);
    const dB = minDistToContour(candidateB.x, candidateB.y);

    if (dA > dB) {
      nx = -nx;
      ny = -ny;
      fence[i] = candidateB;
    } else {
      fence[i] = candidateA;
    }

    // Fallback if the contour-distance heuristic is ambiguous.
    const vx = c.gcx - centroid.x;
    const vy = c.gcy - centroid.y;
    if (Math.abs(dA - dB) < 0.5 && nx * vx + ny * vy < 0) {
      nx = -nx;
      ny = -ny;
      fence[i] = { x: c.gcx - nx * gearR, y: c.gcy - ny * gearR };
    }

    normals[i] = { x: nx, y: ny };
  }

  const segLens = new Array(m);
  const cum = new Array(m + 1);
  cum[0] = 0;
  for (let i = 0; i < m; i++) {
    const a = fence[i];
    const b = fence[(i + 1) % m];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segLens[i] = len;
    cum[i + 1] = cum[i] + len;
  }

  return { fence, centers, normals, segLens, cum, totalLen: cum[m] };
}

function startDraw(debug) {
  if (animId) cancelAnimationFrame(animId);
  drawing = false;

  if (debug === undefined) debug = debugMode;

  const text = document.getElementById('shapeText').value || 'U';
  const gearR = +document.getElementById('gearRadius').value;
  const penD = +document.getElementById('penDist').value;
  const totalLoops = +document.getElementById('loops').value;
  const colorMode = document.getElementById('colorMode').value;

  clearCanvas();
  setStatus('輪郭を抽出中...');

  const contours = resolveContours(text);
  if (!contours.length) { setStatus('輪郭なし'); return; }
  const isInsideShape = buildShapeInsideTester(text, contours);

  // Reset recorded data
  recordedStrokes = [];
  recordedContours = contours.map(c => c.slice());

  // Draw the shape outline
  contours.forEach(c => {
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < c.length; i++) ctx.lineTo(c[i].x, c[i].y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  drawing = true;

  if (debug) {
    drawDebug(contours, isInsideShape, gearR, penD, totalLoops, colorMode);
  } else {
    drawAllContours(contours, isInsideShape, gearR, penD, totalLoops, colorMode);
  }
}

function drawAllContours(contours, isInsideShape, gearR, penD, totalLoops, colorMode) {
  let ci = 0;
  function next() {
    if (ci >= contours.length || !drawing) { setStatus('完了！'); drawing = false; return; }
    drawContourSpiro(contours[ci], ci, contours, isInsideShape, gearR, penD, totalLoops, colorMode, () => { ci++; next(); });
  }
  next();
}

function drawContourSpiro(contour, contourIndex, allContours, isInsideShape, gearR, penD, totalLoops, colorMode, onDone) {
  const outSign = getOutwardSign(contour);
  const roll = buildContactRollingData(contour, gearR, outSign);
  const blocked = computeContactBlockedIndices(roll.centers, contour, allContours, contourIndex, gearR);
  const track = buildContinuousRollTrack(contour, roll, blocked, gearR);
  if (track.totalLen <= 1e-6) {
    if (onDone) onDone();
    return;
  }

  const totalTravel = track.totalLen * totalLoops;
  let travel = 0;
  let gearSpin = 0;
  let segIdx = 0;
  let prevPen = null;

  const speedVal = +document.getElementById('speed').value;
  const ds = Math.max(0.3, Math.min(1.1, track.totalLen / Math.max(260, track.fence.length)));
  const stepsPerFrame = Math.max(1, Math.floor(speedVal * 6));

  function sampleAt(sLocal) {
    const m = track.fence.length;
    while (segIdx < m - 1 && track.cum[segIdx + 1] < sLocal) segIdx++;
    while (segIdx > 0 && track.cum[segIdx] > sLocal) segIdx--;
    const i = segIdx;
    const i2 = (i + 1) % m;
    const len = track.segLens[i] || 1e-6;
    const t = (sLocal - track.cum[i]) / len;
    const ca = track.centers[i];
    const cb = track.centers[i2];
    const fa = track.fence[i];
    const fb = track.fence[i2];
    const gcx = ca.gcx + (cb.gcx - ca.gcx) * t;
    const gcy = ca.gcy + (cb.gcy - ca.gcy) * t;
    const fenceX = fa.x + (fb.x - fa.x) * t;
    const fenceY = fa.y + (fb.y - fa.y) * t;
    let nx = track.normals[i].x * (1 - t) + track.normals[i2].x * t;
    let ny = track.normals[i].y * (1 - t) + track.normals[i2].y * t;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    return {
      nx,
      ny,
      gcx,
      gcy,
      fenceX,
      fenceY,
    };
  }

  function frame() {
    if (!drawing) return;

    for (let s = 0; s < stepsPerFrame && travel < totalTravel; s++) {
      const prevLocal = travel % track.totalLen;
      const nextTravel = Math.min(totalTravel, travel + ds);
      const local = nextTravel % track.totalLen;
      if (local < prevLocal) segIdx = 0; // loop wrapped

      const sample = sampleAt(local);
      const gcx = sample.gcx;
      const gcy = sample.gcy;
      gearSpin += (nextTravel - travel) / gearR;
      travel = nextTravel;

      const gearAngle = Math.atan2(sample.ny, sample.nx) + Math.PI + gearSpin;
      const penX = gcx + Math.cos(gearAngle) * penD;
      const penY = gcy + Math.sin(gearAngle) * penD;

      if (prevPen) {
        const t = travel / totalTravel;
        const color = getColor(t * totalLoops * 0.3, colorMode);
        ctx.beginPath();
        ctx.moveTo(prevPen.x, prevPen.y);
        ctx.lineTo(penX, penY);
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.55;
        ctx.stroke();
        recordedStrokes.push({ x1: prevPen.x, y1: prevPen.y, x2: penX, y2: penY, color, width: 0.55 });
      }
      prevPen = { x: penX, y: penY };
    }

    setStatus(`描画中... ${Math.min(100, (travel / totalTravel * 100) | 0)}%`);
    if (travel < totalTravel) animId = requestAnimationFrame(frame);
    else if (onDone) onDone();
  }
  animId = requestAnimationFrame(frame);
}

function previewPathMotion() {
  if (animId) cancelAnimationFrame(animId);
  drawing = false;
  clearCanvas();

  const text = document.getElementById('shapeText').value || 'U';
  const totalLoops = +document.getElementById('loops').value;
  const contours = resolveContours(text);
  if (!contours.length) {
    setStatus('輪郭なし');
    return;
  }

  const contour = contours[0];
  const n = contour.length;
  const totalSteps = n * totalLoops;
  const speedVal = +document.getElementById('speed').value;
  const stepsPerFrame = Math.max(1, Math.floor(speedVal * n / 300));
  let step = 0;

  ctx.beginPath();
  ctx.moveTo(contour[0].x, contour[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(contour[i].x, contour[i].y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();

  drawing = true;

  function frame() {
    if (!drawing) return;

    step = Math.min(totalSteps, step + stepsPerFrame);
    const i = step % n;
    const p = contour[i];

    ctx.fillStyle = '#f0ece4';
    ctx.fillRect(0, 0, W, H);

    ctx.beginPath();
    ctx.moveTo(contour[0].x, contour[0].y);
    for (let k = 1; k < n; k++) ctx.lineTo(contour[k].x, contour[k].y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 70, 70, 0.9)';
    ctx.fill();

    const pct = Math.min(100, (step / totalSteps * 100) | 0);
    setStatus(`パス沿いプレビュー... ${pct}%`);

    if (step < totalSteps) {
      animId = requestAnimationFrame(frame);
    } else {
      drawing = false;
      setStatus('パス沿いプレビュー完了');
    }
  }

  animId = requestAnimationFrame(frame);
}
