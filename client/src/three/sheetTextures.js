import { CanvasTexture, SRGBColorSpace } from 'three';

// Paper colours stay "paper" in both themes: they're physical sheets lying on the desk.
const PAPER = '#FBF8F1';
const INK = '#1B2A4A';
const MUTED = '#5B6478';
const RULE = '#E4DCCB';
const PEN = '#D7452C';
const HIGHLIGHT = '#F4D35E';

export const SHEET_W = 2; // world units; A4 proportions
export const SHEET_H = 2 * Math.SQRT2;
const PX_W = 640;
const PX_H = Math.round(PX_W * Math.SQRT2);
const MARGIN_X = 78;

// Questions on each sheet. `hot` marks the ones the highlighter sweeps over (asked again and again).
export const PAPERS = [
  {
    year: 2025,
    questions: [
      { n: '8.', text: 'Explain the OSI reference model with a neat diagram.', hot: true },
      { n: '2.', text: 'Explain star and ring topologies.', hot: true },
      { n: '6.', text: 'Differentiate between TCP and UDP.', hot: true },
      { n: '9.', text: 'Explain circuit switching and packet switching.' },
      { n: '5.', text: 'Explain link state routing.' },
      { n: '11.', text: 'Explain TCP connection establishment.' },
    ],
  },
  {
    year: 2024,
    questions: [
      { n: '8.', text: 'Explain the OSI model in detail.' },
      { n: '9.', text: 'Explain network topologies.' },
      { n: '10.', text: 'Describe the leaky bucket algorithm.' },
      { n: '5.', text: 'Explain distance vector routing.' },
    ],
  },
  {
    year: 2023,
    questions: [
      { n: '8.', text: 'Explain the OSI reference model.' },
      { n: '11.', text: 'Differentiate between TCP and UDP.' },
      { n: '2.', text: 'Explain bus and mesh topologies.' },
      { n: '10.', text: 'Explain the token bucket algorithm.' },
    ],
  },
  {
    year: 2022,
    questions: [
      { n: '8.', text: 'Explain the OSI reference model.' },
      { n: '3.', text: 'Explain star and ring topologies.' },
      { n: '6.', text: 'Differentiate between TCP and UDP.' },
      { n: '7.', text: 'Explain the working of DNS.' },
    ],
  },
];

// Topics × years for the heatmap the front sheet turns into (counts from the CN sample papers).
export const HEATMAP = {
  years: [2022, 2023, 2024, 2025],
  rows: [
    { topic: 'Network models (OSI)', counts: [2, 2, 1, 2] },
    { topic: 'Congestion control', counts: [1, 3, 1, 1] },
    { topic: 'Routing algorithms', counts: [2, 2, 1, 1] },
    { topic: 'Network topologies', counts: [1, 2, 1, 1] },
    { topic: 'TCP', counts: [2, 0, 1, 2] },
    { topic: 'Satellite communication', counts: [0, 0, 0, 1] },
  ],
};

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = PX_W;
  canvas.height = PX_H;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function paperBackground(ctx) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PX_W, PX_H);
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  for (let y = 190; y < PX_H - 30; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(PX_W, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(215, 69, 44, 0.55)';
  ctx.beginPath();
  ctx.moveTo(MARGIN_X - 18, 0);
  ctx.lineTo(MARGIN_X - 18, PX_H);
  ctx.stroke();
}

// Canvas px → position on the plane (centre = 0,0; y up).
const toLocal = (x, y) => ({ x: (x / PX_W - 0.5) * SHEET_W, y: (0.5 - y / PX_H) * SHEET_H });

// Returns { texture, strokes: [{ x, y, width, height }] } with stroke positions in sheet-local units.
export function makeSheet(paper) {
  const [canvas, ctx] = makeCanvas();
  paperBackground(ctx);

  ctx.fillStyle = MUTED;
  ctx.font = '500 20px "JetBrains Mono Variable", monospace';
  ctx.fillText('BCA III SEMESTER · MODEL PAPER', MARGIN_X, 70);
  ctx.fillStyle = INK;
  ctx.font = '600 40px "Fraunces Variable", Georgia, serif';
  ctx.fillText('Computer Networks', MARGIN_X, 120);
  ctx.fillStyle = PEN;
  ctx.font = '600 30px "JetBrains Mono Variable", monospace';
  ctx.fillText(String(paper.year), PX_W - 150, 120);

  const strokes = [];
  let y = 228;
  ctx.font = '400 23px "DM Sans Variable", system-ui, sans-serif';
  for (const q of paper.questions) {
    const lines = wrap(ctx, q.text, PX_W - MARGIN_X - 90);
    ctx.fillStyle = MUTED;
    ctx.fillText(q.n, MARGIN_X, y);
    ctx.fillStyle = INK;
    lines.forEach((line, i) => {
      const lineY = y + i * 44;
      ctx.fillText(line, MARGIN_X + 46, lineY);
      if (q.hot) {
        const width = ctx.measureText(line).width + 14;
        const start = toLocal(MARGIN_X + 39, lineY - 22);
        strokes.push({ x: start.x, y: start.y, width: (width / PX_W) * SHEET_W, height: (30 / PX_H) * SHEET_H });
      }
    });
    y += lines.length * 44 + 44;
  }
  return { texture: toTexture(canvas), strokes };
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  lines.push(line);
  return lines;
}

// The heatmap card: labels and grid outlines are drawn here; the cells that fill up are separate meshes.
// Returns { texture, cells: [{ x, y, w, h, count, row, col }] } in local units.
export function makeHeatmapCard() {
  const [canvas, ctx] = makeCanvas();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PX_W, PX_H);

  ctx.fillStyle = MUTED;
  ctx.font = '500 20px "JetBrains Mono Variable", monospace';
  ctx.fillText('ANALYZER · 4 PAPERS', 48, 72);
  ctx.fillStyle = INK;
  ctx.font = '600 38px "Fraunces Variable", Georgia, serif';
  ctx.fillText('Topics × years', 48, 122);

  const labelW = 300;
  const cellW = 62;
  const cellH = 70;
  const gap = 10;
  const top = 230;
  ctx.font = '500 19px "JetBrains Mono Variable", monospace';
  ctx.fillStyle = MUTED;
  HEATMAP.years.forEach((year, c) => ctx.fillText(`’${String(year).slice(2)}`, labelW + c * (cellW + gap) + 14, top - 22));

  const cells = [];
  HEATMAP.rows.forEach((row, r) => {
    const y = top + r * (cellH + gap);
    ctx.fillStyle = INK;
    ctx.font = '400 22px "DM Sans Variable", system-ui, sans-serif';
    ctx.fillText(row.topic.length > 22 ? `${row.topic.slice(0, 21)}…` : row.topic, 48, y + cellH / 2 + 8);
    row.counts.forEach((count, c) => {
      const x = labelW + c * (cellW + gap);
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = RULE;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cellW, cellH);
      ctx.setLineDash([]);
      if (count) {
        const centre = toLocal(x + cellW / 2, y + cellH / 2);
        cells.push({ ...centre, w: (cellW / PX_W) * SHEET_W, h: (cellH / PX_H) * SHEET_H, count, row: r, col: c });
      }
    });
  });

  ctx.fillStyle = PEN;
  ctx.font = 'italic 500 26px "Fraunces Variable", Georgia, serif';
  ctx.fillText('Network models: asked every year.', 48, top + HEATMAP.rows.length * (cellH + gap) + 60);
  return { texture: toTexture(canvas), cells };
}

export const COLORS = { HIGHLIGHT, PAPER, INK };
