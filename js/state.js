const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// HiDPI / Retina support
const dpr = window.devicePixelRatio || 1;
const CSS_W = 800, CSS_H = 800;
canvas.width = CSS_W * dpr;
canvas.height = CSS_H * dpr;
canvas.style.width = CSS_W + 'px';
canvas.style.height = CSS_H + 'px';
ctx.scale(dpr, dpr);

const W = CSS_W, H = CSS_H;

let animId = null;
let drawing = false;
let debugMode = false;
let contourSource = 'text'; // 'text' | 'svg'
let uploadedSvgName = '';
let uploadedContours = [];

// Record all strokes for SVG export
// Each entry: { x1, y1, x2, y2, color, width }
let recordedStrokes = [];
let recordedContours = []; // faint shape outlines
