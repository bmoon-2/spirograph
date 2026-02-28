// Slider updates
document.querySelectorAll('input[type=range]').forEach(inp => {
  inp.addEventListener('input', () => {
    document.getElementById(inp.id + 'Val').textContent = inp.value;
  });
});

const sourceModeEl = document.getElementById('sourceMode');
if (sourceModeEl) {
  sourceModeEl.addEventListener('change', e => {
    setContourSource(e.target.value);
  });
}

const svgUploadEl = document.getElementById('svgUpload');
if (svgUploadEl) {
  svgUploadEl.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    handleSvgUploadFile(file);
  });
}

function setShape(s) {
  document.getElementById('shapeText').value = s;
  const sourceSel = document.getElementById('sourceMode');
  if (sourceSel) sourceSel.value = 'text';
  setContourSource('text');
}
function setStatus(s) {
  const suffix = ` [${BUILD_ID}${typeof ClipperLib !== 'undefined' ? ' +clipper' : ''}]`;
  document.getElementById('status').textContent = (s || '') + suffix;
}

function clearCanvas() {
  if (animId) cancelAnimationFrame(animId);
  drawing = false;
  ctx.fillStyle = '#f0ece4';
  ctx.fillRect(0, 0, W, H);
  setStatus('');
}

function toggleDebug() {
  debugMode = !debugMode;
  document.getElementById('debugBtn').classList.toggle('active', debugMode);
  startDraw(debugMode);
}
