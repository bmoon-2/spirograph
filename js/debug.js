// =========================================================
// DEBUG MODE - gear rolling animation through all loops
// =========================================================

function drawDebug(contours, isInsideShape, gearR, penD, totalLoops, colorMode) {
  const contour = contours[0]; // just show first contour
  const n = contour.length;
  const outSign = getOutwardSign(contour);
  const roll = buildContactRollingData(contour, gearR, outSign);
  const blocked = computeContactBlockedIndices(roll.centers, contour, contours, 0, gearR);
  const track = buildContinuousRollTrack(contour, roll, blocked, gearR);
  if (track.totalLen <= 1e-6 || !track.fence.length) {
    setStatus('デバッグ: 連続トラックを構築できませんでした');
    drawing = false;
    return;
  }

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

  const totalTravel = track.totalLen * totalLoops;
  let travel = 0;
  let gearSpin = 0;
  let segIdx = 0;
  let prevPen = null;
  let lastSample = {
    gcx: track.centers[0].gcx,
    gcy: track.centers[0].gcy,
    nx: track.normals[0].x,
    ny: track.normals[0].y,
    fenceX: track.fence[0].x,
    fenceY: track.fence[0].y,
    penX: track.centers[0].gcx + penD,
    penY: track.centers[0].gcy,
    angle: 0,
  };

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

  function drawRollCandidatePath() {
    for (let i = 0; i < n; i++) {
      const a = roll.centers[i];
      const b = roll.centers[(i + 1) % n];
      ctx.beginPath();
      ctx.moveTo(a.gcx, a.gcy);
      ctx.lineTo(b.gcx, b.gcy);
      const dim = blocked[i] || blocked[(i + 1) % n];
      ctx.strokeStyle = dim ? 'rgba(255, 90, 90, 0.07)' : 'rgba(255, 90, 90, 0.16)';
      ctx.lineWidth = dim ? 1 : 1.2;
      ctx.stroke();
    }
  }

  function drawTrackPath() {
    const pts = track.centers;
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].gcx, pts[0].gcy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].gcx, pts[i].gcy);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 170, 40, 0.72)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function frame() {
    if (!drawing) return;

    for (let s = 0; s < stepsPerFrame && travel < totalTravel; s++) {
      const prevLocal = travel % track.totalLen;
      const nextTravel = Math.min(totalTravel, travel + ds);
      const local = nextTravel % track.totalLen;
      if (local < prevLocal) segIdx = 0;

      const sample = sampleAt(local);
      gearSpin += (nextTravel - travel) / gearR;
      travel = nextTravel;

      const gearAngle = Math.atan2(sample.ny, sample.nx) + Math.PI + gearSpin;
      const penX = sample.gcx + Math.cos(gearAngle) * penD;
      const penY = sample.gcy + Math.sin(gearAngle) * penD;
      lastSample = {
        ...sample,
        penX,
        penY,
        angle: gearAngle,
      };

      if (prevPen) {
        const t = travel / totalTravel;
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

    // Raw candidate center path and final continuous track.
    drawRollCandidatePath();
    drawTrackPath();

    // Trail
    ctx.drawImage(trailCanvas, 0, 0, W, H);

    const cgcx = lastSample.gcx;
    const cgcy = lastSample.gcy;
    const cAngle = lastSample.angle;
    const cpx = lastSample.penX;
    const cpy = lastSample.penY;
    const fenceX = lastSample.fenceX;
    const fenceY = lastSample.fenceY;

    // Draw gear circle
    ctx.beginPath();
    ctx.arc(cgcx, cgcy, gearR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw exact fence point from the continuous roll track.
    ctx.beginPath();
    ctx.arc(fenceX, fenceY, 4, 0, Math.PI * 2);
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

    // Line from fence point to gear center (normal)
    ctx.beginPath();
    ctx.moveTo(fenceX, fenceY);
    ctx.lineTo(cgcx, cgcy);
    ctx.strokeStyle = 'rgba(0, 200, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

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

    const pct = Math.min(100, (travel / totalTravel * 100) | 0);
    setStatus(`デバッグ: ${pct}% | 薄赤=元中心候補 橙破線=中心トラック 緑=フェンス点 赤=ギア中心 青=ペン`);

    if (travel < totalTravel) {
      animId = requestAnimationFrame(frame);
    } else {
      setStatus('完了！');
      drawing = false;
    }
  }

  animId = requestAnimationFrame(frame);
}
