# Fixtures

`worksheet.jpg` (1240x1754, A4 at 150dpi, JPEG q85) and `worksheet.pdf` (one A4
page, Helvetica base-14) are the same **synthetic** grade-4 homework sheet —
"Weekly Practice: Fractions & Living Things", mixed elementary math + science per
PRD §2, with fraction problems (a quarters bar, an eighths pie, sums, a word
problem) and a science section on habitats and the water cycle. No real student
work is involved; nothing here was scanned from a real worksheet. The pair exists
so both S1 ingest paths can be exercised: the JPEG goes down the vision path and
the PDF down the native-document path (PRD F1, ARCH §2). Regenerate them with
`powershell -ExecutionPolicy Bypass -File scripts/make-fixture.ps1` (image, uses
System.Drawing) and `node scripts/make-fixture.mjs` (PDF, hand-written, no npm
dependency) — the two scripts mirror each other's layout, so edit both together.
They are consumed by the pipeline smoke test, run from `api/` against a live
`npm run dev`:

```
npm run smoke -- ./fixtures/worksheet.jpg on-level
npm run smoke -- ./fixtures/worksheet.pdf on-level
```
