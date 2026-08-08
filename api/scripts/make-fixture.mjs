/**
 * Regenerates api/fixtures/worksheet.pdf — the PDF twin of worksheet.jpg, used
 * to exercise the native-document path into S1 /api/extract (PRD F1: "Anthropic
 * ingests PDFs natively"; ARCH §2: image *or* native PDF `document` block).
 *
 * Writes the PDF by hand — no npm dependency — as a single A4 page with the
 * base-14 fonts Helvetica and Helvetica-Bold, plus the vector bits the math
 * questions need (a quarters bar, an eighths pie, answer rules). Text is
 * wrapped with the real Helvetica metrics so nothing runs past the margin.
 *
 * The layout mirrors make-fixture.ps1 one-for-one: that script draws the same
 * worksheet in pixels at 150dpi, and PX below converts those pixels to points.
 * Edit one, edit the other.
 *
 *   node api/scripts/make-fixture.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(HERE, '..', 'fixtures', 'worksheet.pdf');

// ---------------------------------------------------------------- metrics --
// Adobe base-14 widths, 1/1000 em, for ASCII 32..126.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
const WIDTHS = { F1: HELVETICA, F2: HELVETICA_BOLD };

function textWidth(str, font, size) {
  const table = WIDTHS[font];
  let units = 0;
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? table[code - 32] : table[0];
  }
  return (units / 1000) * size;
}

function wrap(str, font, size, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of str.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, font, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ------------------------------------------------------------------ page ----
const PX = 0.48; // 1 px @150dpi -> 1 pt @72dpi
const PAGE_W = 1240 * PX; // 595.2 -> A4
const PAGE_H = 1754 * PX; // 841.92
const ML = 96 * PX;
const CONTENT_W = (1240 - 96 - 96) * PX;

const INK = [0.11, 0.11, 0.125];
const INK_SOFT = [0.36, 0.36, 0.39];
const SHADE = [0.69, 0.7, 0.73];
const RULE = [0.47, 0.48, 0.51];
const THIN = [0.59, 0.6, 0.63];

const ops = [];
let y = 92 * PX; // cursor, measured from the top of the page

const num = (n) => (Math.round(n * 100) / 100).toString();
const flipY = (topY) => PAGE_H - topY;
const escape = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Draws one line of text whose *top* sits at topY (matches GDI+ DrawString). */
function text(str, { font = 'F1', size = 11.5, x = ML, topY = y, color = INK } = {}) {
  const baseline = flipY(topY + size * 0.905); // Helvetica ascent
  ops.push(
    `${num(color[0])} ${num(color[1])} ${num(color[2])} rg`,
    'BT',
    `/${font} ${num(size)} Tf`,
    `1 0 0 1 ${num(x)} ${num(baseline)} Tm`,
    `(${escape(str)}) Tj`,
    'ET',
  );
}

const LINE_H = (size) => size * 1.18;

/** Wrapped paragraph; returns the height it consumed. */
function paragraph(str, { font = 'F1', size = 11.5, x = ML, topY = y, width = CONTENT_W, color = INK } = {}) {
  const lines = wrap(str, font, size, width);
  lines.forEach((line, i) => text(line, { font, size, x, topY: topY + i * LINE_H(size), color }));
  return lines.length * LINE_H(size);
}

function stroke(color, widthPt) {
  ops.push(`${num(color[0])} ${num(color[1])} ${num(color[2])} RG`, `${num(widthPt)} w`);
}

function rule(topY, x1 = ML, x2 = PAGE_W - ML, color = RULE, w = 0.7) {
  stroke(color, w);
  ops.push(`${num(x1)} ${num(flipY(topY))} m ${num(x2)} ${num(flipY(topY))} l S`);
}

const blank = (x, topY, len) => rule(topY, x, x + len, [0.25, 0.26, 0.28], 0.9);

function rect(x, topY, w, h, color = [0.25, 0.26, 0.28], lw = 0.9) {
  stroke(color, lw);
  ops.push(`${num(x)} ${num(flipY(topY + h))} ${num(w)} ${num(h)} re S`);
}

/** Pie slice, angles in screen degrees (0 = east, growing clockwise). */
function pieSlice(cx, cyTop, r, startDeg, sweepDeg, fill) {
  const rad = (d) => (d * Math.PI) / 180;
  const at = (d) => [cx + r * Math.cos(rad(d)), cyTop + r * Math.sin(rad(d))];
  const tangent = (d) => [-Math.sin(rad(d)), Math.cos(rad(d))];
  const k = (4 / 3) * Math.tan(rad(sweepDeg) / 4) * r;

  const [x0, y0] = at(startDeg);
  const [x3, y3] = at(startDeg + sweepDeg);
  const [t0x, t0y] = tangent(startDeg);
  const [t1x, t1y] = tangent(startDeg + sweepDeg);
  const p = (x, ty) => `${num(x)} ${num(flipY(ty))}`;

  ops.push(`${p(cx, cyTop)} m`, `${p(x0, y0)} l`);
  ops.push(`${p(x0 + k * t0x, y0 + k * t0y)} ${p(x3 - k * t1x, y3 - k * t1y)} ${p(x3, y3)} c`);
  ops.push('h');
  if (fill) {
    ops.push(`${num(SHADE[0])} ${num(SHADE[1])} ${num(SHADE[2])} rg`);
    stroke([0.25, 0.26, 0.28], 0.9);
    ops.push('B');
  } else {
    stroke([0.25, 0.26, 0.28], 0.9);
    ops.push('S');
  }
}

/** Numbered question with a hanging indent; advances the cursor. */
function question(n, body, gap = 14 * PX, size = 11.5) {
  text(n, { font: 'F2', size, x: ML + 4 * PX, topY: y });
  const h = paragraph(body, { size, x: ML + 48 * PX, width: CONTENT_W - 48 * PX, topY: y });
  y += h + gap;
}

// ------------------------------------------------------------- masthead -----
text('Oakridge Elementary School', { size: 9.5, color: INK_SOFT });
y += 26 * PX;
text('Weekly Practice: Fractions & Living Things', { font: 'F2', size: 21 });
y += 44 * PX;
text('Grade 4  -  Unit 6  -  Homework Packet B', { size: 11.5, color: INK_SOFT });
y += 34 * PX;

text('Name:');
blank(ML + 62 * PX, y + 26 * PX, 380 * PX);
text('Date:', { x: ML + 500 * PX });
blank(ML + 556 * PX, y + 26 * PX, 240 * PX);
y += 40 * PX;
rule(y);
y += 22 * PX;

text('Show your work. Answer the science questions in complete sentences.', { size: 9.5, color: INK_SOFT });
y += 34 * PX;

// -------------------------------------------------------- Part A: math ------
text('Part A  -  Math: Fractions', { font: 'F2', size: 13.5 });
y += 34 * PX;

question('1.', 'Shade 3/4 of the bar below. Then write the fraction that is NOT shaded.', 8 * PX);
const barX = ML + 48 * PX;
const cellW = 96 * PX;
const cellH = 62 * PX;
for (let i = 0; i < 4; i++) rect(barX + i * cellW, y, cellW, cellH);
text('Not shaded:', { x: barX + 4 * cellW + 40 * PX, topY: y + 16 * PX });
blank(barX + 4 * cellW + 178 * PX, y + 46 * PX, 140 * PX);
y += cellH + 24 * PX;

question('2.', 'The circle is cut into 8 equal slices. Write the fraction of the circle that is shaded.', 8 * PX);
const cx = ML + 116 * PX;
const cy = y + 76 * PX;
const r = 74 * PX;
for (let i = 0; i < 8; i++) pieSlice(cx, cy, r, -90 + i * 45, 45, i < 3);
text('Shaded =', { size: 13, x: cx + r + 60 * PX, topY: cy - 34 * PX });
blank(cx + r + 178 * PX, cy - 4 * PX, 130 * PX);
text('of the whole circle', { size: 9.5, x: cx + r + 60 * PX, topY: cy + 16 * PX, color: INK_SOFT });
y += 2 * r + 26 * PX;

question('3.', 'Add. Write each answer in its simplest form.', 10 * PX);
for (const [expr, dx] of [['1/5  +  2/5  =', 0], ['3/8  +  4/8  =', 350], ['2/6  +  2/6  =', 700]]) {
  text(expr, { size: 13, x: ML + 48 * PX + dx * PX, topY: y });
  blank(ML + 48 * PX + dx * PX + 172 * PX, y + 30 * PX, 110 * PX);
}
y += 62 * PX;

question('4.', 'Circle the larger fraction in each pair:        2/3   or   2/5              5/8   or   3/8', 16 * PX, 13);

question('5.', 'Maya cut a pizza into 6 equal slices and ate 2 of them. What fraction of the pizza is left? Explain how you know.', 8 * PX);
blank(ML + 48 * PX, y + 26 * PX, CONTENT_W - 48 * PX);
y += 46 * PX;

// ----------------------------------------------------- Part B: science ------
rule(y);
y += 20 * PX;
text('Part B  -  Science: Habitats & the Water Cycle', { font: 'F2', size: 13.5 });
y += 34 * PX;

question('6.', 'Draw a line to match each animal to the habitat where it lives.', 10 * PX);
const animals = ['Polar bear', 'Cactus wren', 'Bottlenose dolphin'];
const habitats = ['Sonoran desert', 'Ocean', 'Arctic tundra'];
const matchTop = y;
for (let i = 0; i < 3; i++) {
  const rowY = matchTop + i * 38 * PX;
  text(animals[i], { x: ML + 80 * PX, topY: rowY });
  ops.push(`${num(INK[0])} ${num(INK[1])} ${num(INK[2])} rg`);
  for (const dotX of [ML + 330 * PX, ML + 560 * PX]) {
    ops.push(`${num(dotX)} ${num(flipY(rowY + 15 * PX))} ${num(3.4 * PX * 2)} ${num(3.4 * PX * 2)} re f`);
  }
  text(habitats[i], { x: ML + 592 * PX, topY: rowY });
}
y = matchTop + 3 * 38 * PX + 14 * PX;

question('7.', 'Name two things every habitat must give an animal so it can survive.', 8 * PX);
text('1)', { x: ML + 48 * PX });
blank(ML + 84 * PX, y + 26 * PX, 380 * PX);
text('2)', { x: ML + 520 * PX });
blank(ML + 556 * PX, y + 26 * PX, 380 * PX);
y += 48 * PX;

question(
  '8.',
  'Fill in the missing word. When the sun heats a lake, water changes into water vapour and rises into the air. This step of the water cycle is called e _ _ _ _ _ _ _ _ _ _ .',
);

question('9.', 'Number the steps of the water cycle in order from 1 to 4.', 10 * PX);
const steps = ['Precipitation', 'Evaporation', 'Collection', 'Condensation'];
const stepTop = y;
steps.forEach((step, i) => {
  const sx = ML + 48 * PX + i * 262 * PX;
  rect(sx, stepTop, 34 * PX, 34 * PX, THIN, 0.6);
  text(step, { x: sx + 44 * PX, topY: stepTop + 4 * PX });
});
y += 52 * PX;

question('10.', 'Water vapour rises high into the sky, where the air is much colder. Explain in one or two sentences why clouds form there.', 10 * PX);
blank(ML + 48 * PX, y + 22 * PX, CONTENT_W - 48 * PX);
blank(ML + 48 * PX, y + 62 * PX, CONTENT_W - 48 * PX);
y += 84 * PX;

// -------------------------------------------------------------- footer ------
rule(y);
y += 12 * PX;
text('Mrs. Alvarez  -  Room 12  -  Return by Friday', { size: 9.5, color: INK_SOFT });
text('page 1 of 1', { size: 9.5, x: PAGE_W - ML - 96 * PX, color: INK_SOFT });

if (y > PAGE_H - 30) throw new Error(`Layout overflowed the page: y=${y}, page height=${PAGE_H}`);

// --------------------------------------------------------- assemble PDF -----
const content = ops.join('\n');
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] ` +
    '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
];

let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf, 'latin1'));
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});

const startxref = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

mkdirSync(dirname(OUT), { recursive: true });
const bytes = Buffer.from(pdf, 'latin1');
writeFileSync(OUT, bytes);
console.log(
  `wrote ${OUT}  ${num(PAGE_W)}x${num(PAGE_H)}pt (A4)  ${objects.length} objects  ${bytes.length} bytes  (content ends at y=${num(y)}pt)`,
);
