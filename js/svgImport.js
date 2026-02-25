const SVG_NS = 'http://www.w3.org/2000/svg';
let measureSvg = null;

function ensureMeasureSvg() {
  if (measureSvg) return measureSvg;
  measureSvg = document.createElementNS(SVG_NS, 'svg');
  measureSvg.setAttribute('width', '0');
  measureSvg.setAttribute('height', '0');
  measureSvg.style.position = 'absolute';
  measureSvg.style.left = '-9999px';
  measureSvg.style.top = '-9999px';
  document.body.appendChild(measureSvg);
  return measureSvg;
}

function parsePointsAttr(pointsAttr) {
  if (!pointsAttr) return [];
  const nums = pointsAttr.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

function samplePathD(d) {
  if (!d) return [];
  const svg = ensureMeasureSvg();
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);

  let points = [];
  try {
    const total = path.getTotalLength();
    if (total > 0) {
      const samples = Math.max(120, Math.min(1600, Math.round(total / 2)));
      points = new Array(samples);
      for (let i = 0; i < samples; i++) {
        const p = path.getPointAtLength((i / samples) * total);
        points[i] = { x: p.x, y: p.y };
      }
    }
  } catch (_e) {
    points = [];
  }

  path.remove();
  return points;
}

function sampleCircle(cx, cy, rx, ry) {
  const n = 240;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
  }
  return pts;
}

function sampleRect(x, y, w, h) {
  if (w <= 0 || h <= 0) return [];
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function closeIfNeeded(pts) {
  if (pts.length < 2) return pts;
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (Math.hypot(a.x - b.x, a.y - b.y) > 0.5) pts.push({ x: a.x, y: a.y });
  return pts;
}

function normalizeContoursToCanvas(contours) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours) {
    for (const p of c) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return [];

  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const margin = 80;
  const scale = (Math.min(W, H) - margin * 2) / Math.max(w, h);
  const ox = (W - w * scale) / 2 - minX * scale;
  const oy = (H - h * scale) / 2 - minY * scale;

  return contours.map(c => {
    const targetPoints = Math.max(180, Math.min(1200, c.length));
    return smoothAndResample(c.map(p => ({ x: p.x * scale + ox, y: p.y * scale + oy })), targetPoints);
  });
}

function parseSvgToContours(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return [];

  const contours = [];

  doc.querySelectorAll('path').forEach(el => {
    const pts = closeIfNeeded(samplePathD(el.getAttribute('d')));
    if (pts.length >= 20) contours.push(pts);
  });

  doc.querySelectorAll('polyline').forEach(el => {
    const pts = closeIfNeeded(parsePointsAttr(el.getAttribute('points')));
    if (pts.length >= 3) contours.push(pts);
  });

  doc.querySelectorAll('polygon').forEach(el => {
    const pts = closeIfNeeded(parsePointsAttr(el.getAttribute('points')));
    if (pts.length >= 3) contours.push(pts);
  });

  doc.querySelectorAll('rect').forEach(el => {
    const x = +el.getAttribute('x') || 0;
    const y = +el.getAttribute('y') || 0;
    const w = +el.getAttribute('width') || 0;
    const h = +el.getAttribute('height') || 0;
    const pts = closeIfNeeded(sampleRect(x, y, w, h));
    if (pts.length >= 3) contours.push(pts);
  });

  doc.querySelectorAll('circle').forEach(el => {
    const cx = +el.getAttribute('cx') || 0;
    const cy = +el.getAttribute('cy') || 0;
    const r = +el.getAttribute('r') || 0;
    const pts = closeIfNeeded(sampleCircle(cx, cy, r, r));
    if (pts.length >= 20) contours.push(pts);
  });

  doc.querySelectorAll('ellipse').forEach(el => {
    const cx = +el.getAttribute('cx') || 0;
    const cy = +el.getAttribute('cy') || 0;
    const rx = +el.getAttribute('rx') || 0;
    const ry = +el.getAttribute('ry') || 0;
    const pts = closeIfNeeded(sampleCircle(cx, cy, rx, ry));
    if (pts.length >= 20) contours.push(pts);
  });

  doc.querySelectorAll('line').forEach(el => {
    const x1 = +el.getAttribute('x1') || 0;
    const y1 = +el.getAttribute('y1') || 0;
    const x2 = +el.getAttribute('x2') || 0;
    const y2 = +el.getAttribute('y2') || 0;
    const pts = closeIfNeeded([{ x: x1, y: y1 }, { x: x2, y: y2 }]);
    if (pts.length >= 3) contours.push(pts);
  });

  return normalizeContoursToCanvas(contours);
}

function setContourSource(mode) {
  contourSource = mode === 'svg' ? 'svg' : 'text';
}

function resolveContours(text) {
  if (contourSource === 'svg' && uploadedContours.length) {
    return uploadedContours.map(c => c.map(p => ({ x: p.x, y: p.y })));
  }
  return extractContours(text);
}

async function handleSvgUploadFile(file) {
  if (!file) return;
  try {
    const svgText = await file.text();
    const contours = parseSvgToContours(svgText);
    if (!contours.length) {
      setStatus('SVGから有効なパスを抽出できませんでした');
      return;
    }
    uploadedContours = contours;
    uploadedSvgName = file.name;
    contourSource = 'svg';
    const sourceSel = document.getElementById('sourceMode');
    if (sourceSel) sourceSel.value = 'svg';
    setStatus(`SVG読み込み完了: ${file.name} (${contours.length}輪郭)`);
    startDraw(false);
  } catch (_e) {
    setStatus('SVGの読み込みに失敗しました');
  }
}

function clearUploadedSvg() {
  uploadedContours = [];
  uploadedSvgName = '';
  contourSource = 'text';
  const sourceSel = document.getElementById('sourceMode');
  if (sourceSel) sourceSel.value = 'text';
  const fileInput = document.getElementById('svgUpload');
  if (fileInput) fileInput.value = '';
  setStatus('SVGを解除しました');
}
