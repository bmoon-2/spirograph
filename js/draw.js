// =========================================================
// DRAW
// =========================================================

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

  const contours = extractContours(text);
  if (!contours.length) { setStatus('輪郭なし'); return; }

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
    drawDebug(contours, gearR, penD, totalLoops, colorMode);
  } else {
    drawAllContours(contours, gearR, penD, totalLoops, colorMode);
  }
}

function drawAllContours(contours, gearR, penD, totalLoops, colorMode) {
  let ci = 0;
  function next() {
    if (ci >= contours.length || !drawing) { setStatus('完了！'); drawing = false; return; }
    drawContourSpiro(contours[ci], gearR, penD, totalLoops, colorMode, () => { ci++; next(); });
  }
  next();
}

function drawContourSpiro(contour, gearR, penD, totalLoops, colorMode, onDone) {
  const n = contour.length;
  const outSign = getOutwardSign(contour);
  const { path: gcPath, segLens, tangentAngles } = buildGearCenterPath(contour, gearR, outSign);

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

      const penX = gcx + Math.cos(gearAngle) * penD;
      const penY = gcy + Math.sin(gearAngle) * penD;

      if (prevPen) {
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
