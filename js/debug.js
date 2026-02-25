// =========================================================
// DEBUG MODE - gear rolling animation through all loops
// =========================================================

function drawDebug(contours, isInsideShape, gearR, penD, totalLoops, colorMode) {
  const contour = contours[0]; // just show first contour
  const n = contour.length;
  const outSign = getOutwardSign(contour);
  const { path: gcPath, segLens, tangentAngles } = buildGearCenterPath(contour, gearR, outSign);
  const blocked = computeBlockedGearIndices(gcPath, contour, contours, 0, gearR);

  // Draw the contour more visibly
  ctx.beginPath();
  ctx.moveTo(contour[0].x, contour[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(contour[i].x, contour[i].y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Store the drawing trail on an offscreen canvas
  const trailCanvas = document.createElement('canvas');
  trailCanvas.width = W * dpr; trailCanvas.height = H * dpr;
  const tctx = trailCanvas.getContext('2d');
  tctx.scale(dpr, dpr);

  let step = 0;
  let cumDist = 0;
  let cumTurn = 0;
  let prevPen = null;
  let lastFreeIndex = 0;
  let lastFreeAngle = 0;
  const totalSteps = n * totalLoops; // animate through all loops

  // Debug speed: based on contour length only (not totalLoops),
  // so the gear is always visibly moving regardless of loop count.
  const speedVal = +document.getElementById('speed').value;
  const stepsPerFrame = Math.max(1, Math.floor(speedVal * n / 300));

  function frame() {
    if (!drawing) return;

    for (let s = 0; s < stepsPerFrame && step < totalSteps; s++, step++) {
      const i = step % n;
      if (step > 0) {
        const iPrev = (step - 1) % n;
        cumDist += segLens[iPrev];
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
      lastFreeIndex = i;
      lastFreeAngle = gearAngle;

      if (!pointStaysOutsideShape(isInsideShape, contours, penX, penY, gearR)) {
        prevPen = null;
        continue;
      }

      // Draw trail on offscreen canvas
      if (prevPen) {
        if (!segmentStaysOutsideShape(isInsideShape, contours, prevPen.x, prevPen.y, penX, penY, gearR, penD)) {
          prevPen = null;
          continue;
        }
        const t = step / totalSteps;
        tctx.beginPath();
        tctx.moveTo(prevPen.x, prevPen.y);
        tctx.lineTo(penX, penY);
        tctx.strokeStyle = getColor(t * totalLoops * 0.3, colorMode);
        tctx.lineWidth = 1;
        tctx.stroke();
      }
      prevPen = { x: penX, y: penY };
    }

    // Redraw everything each frame
    ctx.fillStyle = '#f0ece4';
    ctx.fillRect(0, 0, W, H);

    // Contour
    ctx.beginPath();
    ctx.moveTo(contour[0].x, contour[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(contour[i].x, contour[i].y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Trail
    ctx.drawImage(trailCanvas, 0, 0, W, H);

    // Current gear position (use last step in this frame's batch)
    const ci = lastFreeIndex;
    const cgcx = gcPath[ci].gcx;
    const cgcy = gcPath[ci].gcy;
    const cAngle = lastFreeAngle;
    const cpx = cgcx + Math.cos(cAngle) * penD;
    const cpy = cgcy + Math.sin(cAngle) * penD;

    // Draw gear circle
    ctx.beginPath();
    ctx.arc(cgcx, cgcy, gearR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw contact point
    const cpt = contour[ci];
    ctx.beginPath();
    ctx.arc(cpt.x, cpt.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 200, 0, 0.8)';
    ctx.fill();

    // Draw gear center
    ctx.beginPath();
    ctx.arc(cgcx, cgcy, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 80, 80, 0.8)';
    ctx.fill();

    // Draw pen position
    ctx.beginPath();
    ctx.arc(cpx, cpy, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(80, 80, 255, 0.9)';
    ctx.fill();

    // Line from center to pen
    ctx.beginPath();
    ctx.moveTo(cgcx, cgcy);
    ctx.lineTo(cpx, cpy);
    ctx.strokeStyle = 'rgba(80, 80, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Line from contour point to gear center (normal)
    ctx.beginPath();
    ctx.moveTo(cpt.x, cpt.y);
    ctx.lineTo(cgcx, cgcy);
    ctx.strokeStyle = 'rgba(0, 200, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw gear "teeth" marks for rotation visualization
    const numMarks = 8;
    for (let m = 0; m < numMarks; m++) {
      const a = cAngle + (m / numMarks) * Math.PI * 2;
      const mx = cgcx + Math.cos(a) * gearR;
      const my = cgcy + Math.sin(a) * gearR;
      ctx.beginPath();
      ctx.arc(mx, my, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,80,80,0.4)';
      ctx.fill();
    }

    const pct = Math.min(100, (step / totalSteps * 100) | 0);
    setStatus(`デバッグ: ${pct}% | 🟢接点 🔴ギア中心 🔵ペン`);

    if (step < totalSteps) {
      animId = requestAnimationFrame(frame);
    } else {
      setStatus('完了！');
      drawing = false;
    }
  }

  animId = requestAnimationFrame(frame);
}
