import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4321/states.html';
const WIDTHS = [320, 390, 768, 1024, 1440];

const browser = await chromium.launch();
const failures = [];

for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const report = await page.evaluate(() => {
    const out = { docScroll: null, cases: [] };
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth) {
      out.docScroll = { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth };
    }

    const rect = (n) => n.getBoundingClientRect();
    const overlaps = (a, b) =>
      a.left < b.right - 0.5 &&
      b.left < a.right - 0.5 &&
      a.top < b.bottom - 0.5 &&
      b.top < a.bottom - 0.5;

    const contentBox = (el) => {
      const r = rect(el);
      const cs = getComputedStyle(el);
      return {
        top: r.top + parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth),
        bottom: r.bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth),
        left: r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth),
        right: r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth),
      };
    };

    for (const el of document.querySelectorAll('.case')) {
      const id = el.querySelector('.case-caption code').textContent.trim();
      const wide = el.classList.contains('is-wide');
      const theme = el.closest('[data-theme]')?.dataset.theme ?? 'light';
      const issues = [];

      const abc = el.querySelector('.abc');
      const sheet = el.querySelector('.abc-sheet');
      const ar = rect(abc);
      const box = contentBox(abc);
      const blocks = [...sheet.children];

      for (const n of blocks) {
        if (n.classList.contains('abc-life')) continue; // the one element that bleeds
        const nr = rect(n);
        if (nr.bottom > ar.bottom + 0.5) issues.push(`${n.className} overflows card bottom`);
        if (nr.right > box.right + 0.5) issues.push(`${n.className} overflows card right`);
        if (nr.left < box.left - 0.5) issues.push(`${n.className} overflows card left`);
      }

      const bar = el.querySelector('.abc-life');
      if (bar) {
        const br = rect(bar);
        if (Math.abs(br.left - ar.left) > 1.5 || Math.abs(br.right - ar.right) > 1.5) {
          issues.push(
            `life bar does not bleed to both card edges (${br.left.toFixed(1)}/${br.right.toFixed(1)} vs ${ar.left.toFixed(1)}/${ar.right.toFixed(1)})`,
          );
        }
      }

      for (let i = 0; i < blocks.length; i += 1) {
        for (let j = i + 1; j < blocks.length; j += 1) {
          if (overlaps(rect(blocks[i]), rect(blocks[j]))) {
            issues.push(`${blocks[i].className} overlaps ${blocks[j].className}`);
          }
        }
      }

      const qr = el.querySelector('.abc-qr');
      if (qr) {
        const qrr = rect(qr);
        const modules = Number(qr.getAttribute('viewBox').split(' ')[2]);
        const need = (qrr.width / modules) * 4;
        const code = qr.closest('.abc-code');
        const codeRect = rect(code);
        const patched = getComputedStyle(code).backgroundColor !== 'rgba(0, 0, 0, 0)';
        const bound = patched ? codeRect : box;
        const clear = {
          left: qrr.left - bound.left,
          right: bound.right - qrr.right,
          top: qrr.top - bound.top,
          bottom: bound.bottom - qrr.bottom,
        };
        for (const n of blocks) {
          if (n === code) continue;
          const nr = rect(n);
          const horizontallyOverlapping = nr.left < qrr.right - 0.5 && qrr.left < nr.right - 0.5;
          if (!horizontallyOverlapping) continue;
          if (nr.bottom <= qrr.top + 0.5) clear.top = Math.min(clear.top, qrr.top - nr.bottom);
          if (nr.top >= qrr.bottom - 0.5)
            clear.bottom = Math.min(clear.bottom, nr.top - qrr.bottom);
        }
        for (const [side, got] of Object.entries(clear)) {
          if (got < need - 0.5) {
            issues.push(
              `quiet zone ${side} ${got.toFixed(1)}px < ${need.toFixed(1)}px (4 modules)`,
            );
          }
        }
      }

      for (const btn of el.querySelectorAll('.abc-btn')) {
        const base = btn.querySelector(':scope > .abc-btn-label');
        const fillLayer = btn.querySelector(':scope > .abc-btn-fill');
        if (!base || !fillLayer) {
          issues.push('button is missing its fill layer');
          continue;
        }
        const inner = fillLayer.querySelector('.abc-btn-label');
        const a = rect(base);
        const b = rect(inner);
        if (Math.abs(a.left - b.left) > 0.5 || Math.abs(a.top - b.top) > 0.5) {
          issues.push(
            `fill label offset by ${(b.left - a.left).toFixed(1)}×${(b.top - a.top).toFixed(1)}px`,
          );
        }
        const fr = rect(fillLayer);
        const btr = rect(btn);
        if (fr.width > btr.width + 0.5 || fr.height > btr.height + 0.5) {
          issues.push('fill layer larger than its control');
        }
      }

      for (const btn of el.querySelectorAll('button')) {
        const br = rect(btn);
        if (br.height < 24 || br.width < 24) {
          issues.push(
            `${btn.className || 'button'} target ${br.width.toFixed(0)}×${br.height.toFixed(0)}`,
          );
        }
      }

      if (issues.length) out.cases.push({ id, wide, theme, issues });
    }
    return out;
  });

  if (report.docScroll) {
    failures.push(
      `${width}px — page scrolls horizontally (${report.docScroll.scrollWidth} > ${report.docScroll.clientWidth})`,
    );
  }
  for (const c of report.cases) {
    for (const issue of c.issues) {
      failures.push(`${width}px — ${c.id}${c.wide ? ' (wide)' : ''}/${c.theme}: ${issue}`);
    }
  }
  await context.close();
}

await browser.close();

if (failures.length === 0) {
  console.log(`layout ok — ${WIDTHS.join(', ')}px`);
} else {
  console.log(`${failures.length} problema(s):`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
}
