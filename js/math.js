// =========================================================
// SPIROGRAPH CORE MATH
// =========================================================

// Compute centroid of contour
function getCentroid(pts) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  return { x: cx / pts.length, y: cy / pts.length };
}

// Determine outward sign once per contour:
// Test a candidate normal at one point — if it points away from centroid, that's outward.
function getOutwardSign(pts) {
  const c = getCentroid(pts);
  const n = pts.length;
  // Use point 0 as test point
  const W = 4;
  const prev = pts[(0 - W + n) % n];
  const next = pts[(0 + W) % n];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  // Candidate normal A: (-dy, dx)
  const nAx = -dy, nAy = dx;
  // Vector from centroid to contour point
  const toCx = pts[0].x - c.x;
  const toCy = pts[0].y - c.y;
  // If dot(normalA, toCenter) > 0, normalA points outward
  const dot = nAx * toCx + nAy * toCy;
  return dot > 0 ? 1 : -1;
}

// Compute outward normal at index i — uses pre-computed outward sign
function getOutwardNormal(pts, i, outSign) {
  const n = pts.length;
  const W = 4; // average over ±4 neighbours
  const prev = pts[(i - W + n) % n];
  const next = pts[(i + W) % n];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: outSign * (-dy) / len,
    y: outSign * ( dx) / len
  };
}

// =========================================================
// Pre-compute gear-center path with minimum-distance guarantee.
//
// The gear center must always be at least gearR away from every
// point on the contour.  At sharp convex corners the naive offset
// (pt + normal*R) creates cusps where the path folds back inside.
//
// Strategy: "Closest-point push-out" — for each gc point that is
// too close to the contour, find the closest point on the contour
// and push the gc AWAY from it to exactly gearR distance.
// This naturally creates circular arcs around sharp corners (the
// Minkowski sum behaviour) without any arc-insertion logic.
//
// After the initial push, we iteratively smooth and re-enforce to
// get a clean path.  We also limit consecutive-point jumps.
// =========================================================
function buildGearCenterPath(contour, gearR, outSign) {
  const n = contour.length;

  // Segment lengths along contour
  const segLens = [];
  for (let i = 0; i < n; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % n];
    segLens.push(Math.hypot(b.x - a.x, b.y - a.y));
  }

  // ---- Spatial grid for fast closest-point lookup ----
  const cellSize = gearR;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let j = 0; j < n; j++) {
    minX = Math.min(minX, contour[j].x);
    minY = Math.min(minY, contour[j].y);
    maxX = Math.max(maxX, contour[j].x);
    maxY = Math.max(maxY, contour[j].y);
  }
  minX -= cellSize * 2; minY -= cellSize * 2;
  maxX += cellSize * 2; maxY += cellSize * 2;
  const gridW = Math.ceil((maxX - minX) / cellSize) + 1;
  const gridH = Math.ceil((maxY - minY) / cellSize) + 1;
  const grid = new Array(gridW * gridH);
  for (let g = 0; g < grid.length; g++) grid[g] = [];

  // Insert each contour segment into grid cells it overlaps
  for (let j = 0; j < n; j++) {
    const j2 = (j + 1) % n;
    const x0 = Math.min(contour[j].x, contour[j2].x);
    const y0 = Math.min(contour[j].y, contour[j2].y);
    const x1 = Math.max(contour[j].x, contour[j2].x);
    const y1 = Math.max(contour[j].y, contour[j2].y);
    const gx0 = Math.max(0, Math.floor((x0 - minX) / cellSize) - 1);
    const gy0 = Math.max(0, Math.floor((y0 - minY) / cellSize) - 1);
    const gx1 = Math.min(gridW - 1, Math.floor((x1 - minX) / cellSize) + 1);
    const gy1 = Math.min(gridH - 1, Math.floor((y1 - minY) / cellSize) + 1);
    for (let gy = gy0; gy <= gy1; gy++)
      for (let gx = gx0; gx <= gx1; gx++)
        grid[gy * gridW + gx].push(j);
  }

  // Fast closest point on contour using spatial grid
  function closestOnContour(px, py) {
    let bestD = Infinity, bestX = 0, bestY = 0;
    // Search expanding rings of grid cells
    const gcx = Math.floor((px - minX) / cellSize);
    const gcy = Math.floor((py - minY) / cellSize);
    const searchR = 2; // search ±2 cells
    const gx0 = Math.max(0, gcx - searchR);
    const gy0 = Math.max(0, gcy - searchR);
    const gx1 = Math.min(gridW - 1, gcx + searchR);
    const gy1 = Math.min(gridH - 1, gcy + searchR);

    const checked = new Set();
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const segs = grid[gy * gridW + gx];
        for (let si = 0; si < segs.length; si++) {
          const j = segs[si];
          if (checked.has(j)) continue;
          checked.add(j);
          const j2 = (j + 1) % n;
          const ax = contour[j].x, ay = contour[j].y;
          const bx = contour[j2].x, by = contour[j2].y;
          const dx = bx - ax, dy = by - ay;
          const len2 = dx * dx + dy * dy;
          let t;
          if (len2 < 1e-10) { t = 0; }
          else { t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)); }
          const cx = ax + t * dx, cy = ay + t * dy;
          const d = Math.hypot(px - cx, py - cy);
          if (d < bestD) { bestD = d; bestX = cx; bestY = cy; }
        }
      }
    }

    // Fallback: if grid search found nothing nearby, do brute force
    if (bestD > cellSize * searchR) {
      for (let j = 0; j < n; j++) {
        const j2 = (j + 1) % n;
        const ax = contour[j].x, ay = contour[j].y;
        const bx = contour[j2].x, by = contour[j2].y;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let t;
        if (len2 < 1e-10) { t = 0; }
        else { t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)); }
        const cx = ax + t * dx, cy = ay + t * dy;
        const d = Math.hypot(px - cx, py - cy);
        if (d < bestD) { bestD = d; bestX = cx; bestY = cy; }
      }
    }

    return { x: bestX, y: bestY, dist: bestD };
  }

  // ---- Step 1: Naive offset ----
  const path = [];
  for (let i = 0; i < n; i++) {
    const norm = getOutwardNormal(contour, i, outSign);
    path.push({
      gcx: contour[i].x + norm.x * gearR,
      gcy: contour[i].y + norm.y * gearR,
    });
  }

  // ---- Step 2: Push-out + smooth cycle ----
  function enforce(pts) {
    for (let sub = 0; sub < 5; sub++) {
      let anyV = false;
      for (let i = 0; i < n; i++) {
        const cp = closestOnContour(pts[i].gcx, pts[i].gcy);
        if (cp.dist < gearR - 0.3) {
          let dx = pts[i].gcx - cp.x;
          let dy = pts[i].gcy - cp.y;
          let len = Math.hypot(dx, dy);
          if (len < 0.001) {
            const norm = getOutwardNormal(contour, i, outSign);
            dx = norm.x; dy = norm.y;
          } else {
            dx /= len; dy /= len;
          }
          pts[i].gcx = cp.x + dx * gearR;
          pts[i].gcy = cp.y + dy * gearR;
          anyV = true;
        }
      }
      if (!anyV) break;
    }
  }

  enforce(path);

  for (let iter = 0; iter < 15; iter++) {
    // Very gentle smooth
    const alpha = 0.04;
    const s = [];
    for (let i = 0; i < n; i++) {
      const p = path[(i - 1 + n) % n];
      const c = path[i];
      const nx = path[(i + 1) % n];
      s.push({
        gcx: c.gcx + alpha * ((p.gcx + nx.gcx) / 2 - c.gcx),
        gcy: c.gcy + alpha * ((p.gcy + nx.gcy) / 2 - c.gcy),
      });
    }
    for (let i = 0; i < n; i++) {
      path[i].gcx = s[i].gcx;
      path[i].gcy = s[i].gcy;
    }
    enforce(path);
  }

  // Tangent angles of contour segments (for rolling direction correction)
  const tangentAngles = [];
  for (let i = 0; i < n; i++) {
    const dx = contour[(i + 1) % n].x - contour[i].x;
    const dy = contour[(i + 1) % n].y - contour[i].y;
    tangentAngles.push(Math.atan2(dy, dx));
  }

  return { path, segLens, tangentAngles };
}

function getColor(t, mode) {
  t = ((t % 1) + 1) % 1;
  switch (mode) {
    case 'blue': {
      const r = 15 + Math.sin(t * Math.PI * 8) * 15;
      const g = 40 + Math.sin(t * Math.PI * 8 + 1) * 40;
      const b = 170 + Math.sin(t * Math.PI * 6) * 60;
      return `rgba(${r|0},${g|0},${b|0},0.5)`;
    }
    case 'pink-purple': {
      const phase = t * Math.PI * 2;
      const r = 180 + Math.sin(phase) * 60;
      const g = 50 + Math.sin(phase + 2) * 40;
      const b = 160 + Math.sin(phase + 4) * 80;
      return `rgba(${r|0},${g|0},${b|0},0.45)`;
    }
    case 'red': {
      return `rgba(${200 + Math.sin(t*20)*40|0},${30|0},${30|0},0.5)`;
    }
    case 'green': {
      return `rgba(${30|0},${150 + Math.sin(t*20)*60|0},${60|0},0.5)`;
    }
    case 'rainbow': {
      const r = Math.sin(t * Math.PI * 2) * 127 + 128;
      const g = Math.sin(t * Math.PI * 2 + 2.094) * 127 + 128;
      const b = Math.sin(t * Math.PI * 2 + 4.189) * 127 + 128;
      return `rgba(${r|0},${g|0},${b|0},0.55)`;
    }
  }
}
