// Init
document.title = `Shape Spirograph v3 (${BUILD_ID})`;
const titleEl = document.querySelector('.app h1');
if (titleEl && !titleEl.textContent.includes(BUILD_ID)) {
  titleEl.textContent += ` [${BUILD_ID}]`;
}
clearCanvas();
setTimeout(() => startDraw(false), 400);
