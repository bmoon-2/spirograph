// =========================================================
// EXPORT FUNCTIONS
// =========================================================

function r(v) {
  return Math.round(v * 100) / 100;
}

function makeFilename(ext) {
  const isSvg = contourSource === 'svg' && uploadedSvgName;
  const shape = isSvg
    ? uploadedSvgName.replace(/\.svg$/i, '')
    : (document.getElementById('shapeText').value || 'shape');
  const gR = document.getElementById('gearRadius').value;
  const pD = document.getElementById('penDist').value;
  const lp = document.getElementById('loops').value;
  return `spiro_${shape}_g${gR}_p${pD}_l${lp}.${ext}`;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportSVG() {
  if (recordedStrokes.length === 0) {
    setStatus('先に描画してください');
    return;
  }

  setStatus('SVG生成中...');

  // Group strokes by color+width to use fewer path elements
  const groups = new Map();
  for (const s of recordedStrokes) {
    const key = `${s.color}|${s.width}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  let paths = '';

  // Contour outlines
  for (const contour of recordedContours) {
    if (contour.length < 2) continue;
    let d = `M${r(contour[0].x)},${r(contour[0].y)}`;
    for (let i = 1; i < contour.length; i++) {
      d += `L${r(contour[i].x)},${r(contour[i].y)}`;
    }
    d += 'Z';
    paths += `  <path d="${d}" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="1.5"/>\n`;
  }

  // Spirograph strokes — batch into polylines per group for smaller file size
  for (const [key, strokes] of groups) {
    const [color, width] = key.split('|');

    // Build continuous polyline segments
    let d = '';
    let lastX = null, lastY = null;
    for (const s of strokes) {
      if (lastX !== null && Math.abs(s.x1 - lastX) < 0.01 && Math.abs(s.y1 - lastY) < 0.01) {
        d += `L${r(s.x2)},${r(s.y2)}`;
      } else {
        d += `M${r(s.x1)},${r(s.y1)}L${r(s.x2)},${r(s.y2)}`;
      }
      lastX = s.x2;
      lastY = s.y2;
    }
    paths += `  <path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>\n`;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#f0ece4"/>
${paths}</svg>`;

  downloadFile(svg, makeFilename('svg'), 'image/svg+xml');
  setStatus('SVG保存完了！');
}

function exportPNG() {
  if (recordedStrokes.length === 0 && !drawing) {
    setStatus('先に描画してください');
    return;
  }
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = makeFilename('png');
    a.click();
    URL.revokeObjectURL(url);
    setStatus('PNG保存完了！');
  }, 'image/png');
}
