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

function buildOuterRadiusProfile(contour) {
  const c = getCentroid(contour);
  const bins = 720;
  const maxR = new Array(bins).fill(-Infinity);
  for (let i = 0; i < contour.length; i++) {
    const dx = contour[i].x - c.x;
    const dy = contour[i].y - c.y;
    const r = Math.hypot(dx, dy);
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI * 2;
    const bi = (a / (Math.PI * 2) * bins) | 0;
    if (r > maxR[bi]) maxR[bi] = r;
  }
  // Fill empty bins by nearest previous/next finite values.
  let last = -Infinity;
  for (let i = 0; i < bins; i++) {
    if (Number.isFinite(maxR[i])) last = maxR[i];
    else if (Number.isFinite(last)) maxR[i] = last;
  }
  last = -Infinity;
  for (let i = bins - 1; i >= 0; i--) {
    if (Number.isFinite(maxR[i])) last = maxR[i];
    else if (Number.isFinite(last)) maxR[i] = last;
  }
  for (let i = 0; i < bins; i++) if (!Number.isFinite(maxR[i])) maxR[i] = 0;
  return { cx: c.x, cy: c.y, bins, maxR };
}

function pointOnOuterShell(profile, x, y) {
  const dx = x - profile.cx;
  const dy = y - profile.cy;
  const r = Math.hypot(dx, dy);
  let a = Math.atan2(dy, dx);
  if (a < 0) a += Math.PI * 2;
  const b = (a / (Math.PI * 2) * profile.bins) | 0;
  let ref = 0;
  for (let k = -6; k <= 6; k++) {
    const bi = (b + k + profile.bins) % profile.bins;
    if (profile.maxR[bi] > ref) ref = profile.maxR[bi];
  }
  // Keep points near the outer envelope; reject deeper interior tracks.
  return r >= ref - 1;
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
  const n = contour.length;
  const outSign = getOutwardSign(contour);
  const outerProfile = buildOuterRadiusProfile(contour);
  const { path: gcPath, segLens, tangentAngles } = buildGearCenterPath(contour, gearR, outSign);
  const blocked = computeBlockedGearIndices(gcPath, contour, allContours, contourIndex, gearR);

  const totalSteps = n * totalLoops;
  let step = 0;
  let cumDist = 0;
  let cumTurn = 0;
  let prevPen = null;

  const speedVal = +document.getElementById('speed').value;
  const stepsPerFrame = Math.max(1, Math.floor(speedVal * n * totalLoops / 500));

  function frame() {
    if (!drawing) return;

    for (let s = 0; s < stepsPerFrame && step < totalSteps; s++, step++) {
      const i = step % n;

      // Accumulate distance and contour turning angle
      if (step > 0) {
        const iPrev = (step - 1) % n;
        cumDist += segLens[iPrev];
        // Accumulate change in contour tangent direction (orbital turning)
        let da = tangentAngles[i] - tangentAngles[iPrev];
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        cumTurn += da;
      }

      const gcx = gcPath[i].gcx;
      const gcy = gcPath[i].gcy;
      const gearAngle = cumDist / gearR + cumTurn;

      if (blocked[i]) {
        prevPen = null;
        continue;
      }

      const penX = gcx + Math.cos(gearAngle) * penD;
      const penY = gcy + Math.sin(gearAngle) * penD;

      if (!pointOnOuterShell(outerProfile, penX, penY)) {
        prevPen = null;
        continue;
      }

      if (!pointStaysOutsideShape(isInsideShape, allContours, penX, penY, gearR)) {
        prevPen = null;
        continue;
      }

      if (prevPen) {
        if (!segmentStaysOutsideShape(isInsideShape, allContours, prevPen.x, prevPen.y, penX, penY, gearR, penD)) {
          prevPen = null;
          continue;
        }
        const t = step / totalSteps;
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

    setStatus(`描画中... ${Math.min(100, (step / totalSteps * 100) | 0)}%`);
    if (step < totalSteps) animId = requestAnimationFrame(frame);
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
