// Slider updates
document.querySelectorAll('input[type=range]').forEach(inp => {
  inp.addEventListener('input', () => {
    document.getElementById(inp.id + 'Val').textContent = inp.value;
  });
});

function setShape(s) { document.getElementById('shapeText').value = s; }
function setStatus(s) { document.getElementById('status').textContent = s; }

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
