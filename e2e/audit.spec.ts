import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const HOST = '#checkout > div';

const metric = (name: string, value: number | string, unit = ''): void => {
  console.log(`METRIC ${name}=${value}${unit}`);
};

const surface = (page: Page) => page.locator(HOST);

const events = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __abcEvents: Record<string, string>[] }).__abcEvents ?? [],
  );

test.describe('accessibility', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe: WCAG 2.2 AA on the ${scheme} host`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await expect(surface(page).locator('.abc-qr')).toBeVisible();

      const result = await new AxeBuilder({ page })
        .include('#checkout')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();

      metric(`axe.${scheme}.violations`, result.violations.length);
      metric(`axe.${scheme}.passes`, result.passes.length);
      if (result.violations.length > 0) {
        console.log(JSON.stringify(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.length }))));
      }
      expect(result.violations).toEqual([]);
    });
  }

  test('axe: the terminal states too', async ({ page }) => {
    await page.goto('/?paysAfter=1500');
    await expect(surface(page).locator('.abc-status')).toHaveText('Concluída', { timeout: 15_000 });
    const paid = await new AxeBuilder({ page })
      .include('#checkout')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    metric('axe.paid.violations', paid.violations.length);
    expect(paid.violations).toEqual([]);

    await page.goto('/?fail=1');
    await expect(surface(page).locator('.abc-status')).toHaveText('Não foi possível gerar');
    const failed = await new AxeBuilder({ page })
      .include('#checkout')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    metric('axe.failed.violations', failed.violations.length);
    expect(failed.violations).toEqual([]);
  });

  test('touch target: 48px, above the 24 minimum in 2.5.8', async ({ page }) => {
    await page.goto('/');
    const box = await surface(page).locator('.abc-btn.is-copy').boundingBox();
    metric('target.copy.height', box?.height ?? 0, 'px');
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  });

  test('visible focus with a single ring, measured in both themes', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await expect(surface(page).locator('.abc-btn.is-copy')).toBeVisible();
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const host = document.querySelector('#checkout > div');
        const active = host?.shadowRoot?.activeElement;
        if (!active) return null;
        const style = getComputedStyle(active);
        return { width: style.outlineWidth, offset: style.outlineOffset, style: style.outlineStyle };
      });
      metric(`focus.${scheme}.outline`, `${ring?.width}/${ring?.offset}/${ring?.style}`);
      expect(ring?.style).toBe('solid');
      expect(Number.parseFloat(ring?.width ?? '0')).toBeGreaterThanOrEqual(2);
      expect(Number.parseFloat(ring?.offset ?? '0')).toBeGreaterThanOrEqual(3);
    }
  });
});

test.describe('geometry', () => {
  const widths = [
    { name: '320', width: 320, height: 720 },
    { name: '390', width: 390, height: 844 },
    { name: '768', width: 768, height: 1024 },
    { name: '1440', width: 1440, height: 900 },
    { name: '1440-zoom200', width: 720, height: 450 },
  ];

  for (const size of widths) {
    test(`${size.name}: no horizontal scroll and everything present`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');
      await expect(surface(page).locator('.abc-qr')).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      metric(`layout.${size.name}.scrollWidth`, overflow.scroll, 'px');
      expect(overflow.scroll, 'a guest must not create horizontal scroll on the host').toBeLessThanOrEqual(
        overflow.inner + 1,
      );

      await expect(surface(page).locator('.abc-amount')).toBeVisible();
      await expect(surface(page).locator('.abc-payload-value')).toBeVisible();
      await expect(surface(page).locator('.abc-btn.is-copy')).toBeVisible();
      await expect(surface(page).locator('.abc-note')).toBeVisible();

      const control = await surface(page).locator('.abc-btn.is-copy').boundingBox();
      expect(control?.height ?? 0).toBeGreaterThanOrEqual(48);
    });
  }

  test('the quiet zone is derived and never smaller than 4 modules', async ({ page }) => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const measured = await surface(page).evaluate((host) => {
        const root = (host as HTMLElement).shadowRoot;
        const block = root?.querySelector('.abc-code') as HTMLElement | null;
        const qr = root?.querySelector('.abc-qr') as SVGElement | null;
        if (!block || !qr) return null;
        const padding = Number.parseFloat(getComputedStyle(block).paddingLeft);
        const module = qr.getBoundingClientRect().width / 49;
        return { padding, module, ratio: padding / module };
      });
      metric(`quietzone.${width}.modules`, (measured?.ratio ?? 0).toFixed(2));
      expect(measured?.ratio ?? 0).toBeGreaterThanOrEqual(3.99);
    }
  });
});

test.describe('performance', () => {
  test('CLS on mount, with the container reserved by the merchant', async ({ page }) => {
    await page.goto('/?paysAfter=0');
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            })[]) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => resolve(total), 4000);
        }),
    );
    metric('cwv.cls.mount', cls);
    expect(cls, 'the CLS budget contributed to the host is 0').toBeLessThan(0.01);
  });

  test('CLS when the charge resolves — recorded deviation', async ({ page }) => {
    await page.goto('/?paysAfter=3000');
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            })[]) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => resolve(total), 7000);
        }),
    );
    metric('cwv.cls.resolution', cls);
    expect(cls).toBeLessThan(0.1);
  });

  test('no long task on mount, QR encoding included', async ({ page }) => {
    await page.goto('/');
    await expect(surface(page).locator('.abc-qr')).toBeVisible();
    const tasks = await page.evaluate(() =>
      performance.getEntriesByType('longtask').map((entry) => Math.round(entry.duration)),
    );
    metric('mainthread.longtasks', tasks.length);
    metric('mainthread.longest', tasks.length === 0 ? 0 : Math.max(...tasks), 'ms');
    expect(Math.max(0, ...tasks), 'no task may go past 200ms').toBeLessThan(200);
    expect(tasks.filter((d) => d > 50).length, 'the budget is zero above 50ms').toBe(0);
  });

  test('LCP of the host page with the widget mounted', async ({ page }) => {
    await page.goto('/');
    await expect(surface(page).locator('.abc-qr')).toBeVisible();
    const lcp = await page.evaluate(
      () =>
        new Promise<number | null>((resolve) => {
          let last: number | null = null;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) last = Math.round(entry.startTime);
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          setTimeout(() => resolve(last), 2000);
        }),
    );
    metric('cwv.lcp', lcp ?? 'not-measured', lcp === null ? '' : 'ms');
    if (lcp !== null) expect(lcp).toBeLessThan(2500);
  });

  test('INP of copy-and-paste', async ({ page }) => {
    await page.goto('/');
    const copy = surface(page).locator('.abc-btn.is-copy');
    await expect(copy).toBeVisible();

    await page.evaluate(() => {
      const store = { worst: 0 };
      (window as unknown as { __inp: { worst: number } }).__inp = store;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { interactionId?: number })[]) {
          if (entry.interactionId !== undefined && entry.interactionId > 0) {
            store.worst = Math.max(store.worst, entry.duration);
          }
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 0 } as PerformanceObserverInit);
    });

    await copy.click();
    await expect(copy.locator('.abc-btn-fill')).toHaveText('Código copiado');
    await page.waitForTimeout(500);

    const inp = await page.evaluate(
      () => (window as unknown as { __inp: { worst: number } }).__inp.worst,
    );
    metric('cwv.inp.copy', Math.round(inp), 'ms');
    expect(inp, 'the copy-and-paste budget is 150ms').toBeLessThanOrEqual(150);
  });

  test('zero third-party requests', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== 'localhost' && url.protocol !== 'data:') external.push(request.url());
    });
    await page.goto('/?paysAfter=2000');
    await expect(surface(page).locator('.abc-status')).toHaveText('Concluída', { timeout: 15_000 });
    metric('network.thirdparty', external.length);
    expect(external, 'a guest script that phones home is disqualifying').toEqual([]);
  });
});

test.describe('state matrix', () => {
  test('creating: the skeleton carries the order of what arrives', async ({ page }) => {
    await page.route('**/api/checkout*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    await page.goto('/');
    const root = surface(page);
    await expect(root.locator('.abc-skel-qr')).toBeVisible();
    await expect(root.locator('.abc-skel-control')).toBeVisible();
    await expect(root.locator('.abc-status')).toHaveText('Gerando o código');
    await expect(root.locator('.abc-amount')).toHaveText(/129,90/);
  });

  test('degraded: says it could not confirm, keeps the code and never asserts failure', async ({ page }) => {
    await page.goto('/?paysAfter=0');
    const root = surface(page);
    await expect(root.locator('.abc-qr')).toBeVisible();

    await page.route('**/status', (route) => route.abort());
    await expect(root.locator('.abc-status')).toHaveText('Sem confirmação do servidor', {
      timeout: 30_000,
    });

    await expect(root.locator('.abc-qr'), 'the code is still valid').toBeVisible();
    await expect(root.locator('.abc-note')).toHaveText(/o pagamento não se perde/);
    await expect(root.locator('.abc-mark svg')).toBeVisible();
    await expect(root.locator('.abc-controls .abc-btn')).toBeVisible();
    const note = await root.locator('.abc-note').textContent();
    expect(note ?? '', 'never asserts a payment failure').not.toMatch(/falhou|não foi pago|recusad/i);
  });

  test('expired: the rule at zero, nothing scannable and the explanation before the action', async ({ page }) => {
    await page.goto('/?ttl=3000&paysAfter=0');
    const root = surface(page);
    await expect(root.locator('.abc-status')).toHaveText('Expirada', { timeout: 15_000 });
    await expect(root.locator('.abc-qr')).toHaveCount(0);
    await expect(root.locator('.abc-notice-value')).toHaveText(/EXPIRADO ÀS/);
    await expect(root.locator('.abc-note')).toHaveText(/nada foi cobrado/);

    const order = await root.evaluate((host) => {
      const foot = (host as HTMLElement).shadowRoot?.querySelector('.abc-foot');
      return [...(foot?.children ?? [])].map((child) => child.className);
    });
    metric('order.expired', order.join('>'));
    expect(order[0], 'the explanation comes before the action').toContain('abc-note');

    const fill = await root
      .locator('.abc-life')
      .evaluate((node) => Number(getComputedStyle(node).getPropertyValue('--fill')));
    metric('life.expired.fill', fill);
    expect(fill).toBe(0);
  });

  test('failed: failure to create, with the refusal code in sight', async ({ page }) => {
    await page.goto('/?fail=1');
    const root = surface(page);
    await expect(root.locator('.abc-status')).toHaveText('Não foi possível gerar');
    await expect(root.locator('.abc-notice-value')).toBeVisible();
    await expect(root.locator('.abc-note')).toHaveText(/nada foi cobrado/);
    await expect(root.locator('.abc-controls .abc-btn')).toHaveText(/Tentar de novo/);

    const log = await events(page);
    expect(log.some((event) => event.type === 'error')).toBe(true);
  });

  test('a double click on "try again" does not create two charges', async ({ page }) => {
    const keys: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/checkout')) {
        keys.push(request.headers()['idempotency-key'] ?? 'no-key');
      }
    });
    await page.goto('/?fail=1');
    const retry = surface(page).locator('.abc-controls .abc-btn');
    await expect(retry).toBeVisible();
    await retry.click({ clickCount: 3, delay: 20 });
    await page.waitForTimeout(1500);

    const distinct = new Set(keys);
    metric('idempotency.posts', keys.length);
    metric('idempotency.distinctKeys', distinct.size);
    expect(distinct.size, 'one key for the whole attempt').toBe(1);
  });
});

test.describe('promised fallbacks', () => {
  test('no Shadow DOM: it mounts anyway and says so', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Element.prototype, 'attachShadow', { value: undefined });
    });
    await page.goto('/');
    const host = page.locator('#checkout > div');
    await expect(host).toHaveClass(/abc-root/);
    await expect(host.locator('.abc-qr')).toBeVisible();
    await expect(host.locator('.abc-payload-value')).toBeVisible();

    const log = await events(page);
    metric('fallback.noShadowDom', JSON.stringify(log.filter((e) => e.type === 'degraded')));
    expect(log.some((event) => event.reason === 'no-shadow-dom')).toBe(true);
  });

  test('a payload that overflows the encoder: copy-and-paste leads and the PSP image steps in', async ({
    page,
  }) => {
    await page.goto('/?huge=1');
    const root = surface(page);
    await expect(root.locator('.abc-payload-value')).toBeVisible();
    await expect(root.locator('.abc-btn.is-copy')).toBeVisible();
    await expect(root.locator('.abc-qr'), 'the encoder could not handle it').toHaveCount(0);
    await expect(root.locator('.abc-qr-img'), 'the provider rendering takes its place').toBeVisible();

    const log = await events(page);
    expect(log.some((event) => event.reason === 'qr-encode')).toBe(true);
    const payload = await root.locator('.abc-payload-value').textContent();
    expect(payload ?? '').toContain('br.gov.bcb.pix');
  });

  test('blocked clipboard: it instructs instead of reporting an error', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('blocked')) },
        configurable: true,
      });
    });
    await page.goto('/');
    const root = surface(page);
    await root.locator('.abc-btn.is-copy').click();

    const live = await root.locator('.abc-visually-hidden').textContent();
    metric('fallback.clipboard.announce', live ?? 'empty');
    expect(live ?? '').toMatch(/Selecione e copie/);
    await expect(root.locator('.abc-status'), 'it does not turn into an error state').toHaveText(
      'Aguardando pagamento',
    );
    await expect(root.locator('.abc-payload-value'), 'the payload is still selectable').toBeVisible();
  });

  test('no getStatus and no realtime: the surface declares that it does not check', async ({ page }) => {
    await page.goto('/?nostatus=1');
    await expect(surface(page).locator('.abc-qr')).toBeVisible();
    const log = await events(page);
    metric('fallback.noStatus', JSON.stringify(log.filter((e) => e.type === 'degraded')));
    expect(log.some((event) => event.reason === 'status-unavailable')).toBe(true);
    await expect(surface(page).locator('.abc-meta')).toHaveCount(0);
  });

  test('offline pauses the polling and online resumes it', async ({ page, context }) => {
    let reads = 0;
    await page.route('**/status', async (route) => {
      reads += 1;
      await route.continue();
    });
    await page.goto('/?paysAfter=0');
    await expect(surface(page).locator('.abc-qr')).toBeVisible();

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const before = reads;
    await page.waitForTimeout(4000);
    metric('fallback.offline.reads', reads - before);
    expect(reads - before, 'the server is not hammered while offline').toBeLessThanOrEqual(1);

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(1500);
    expect(reads).toBeGreaterThan(before);
  });

  test('prefers-reduced-motion: the sweep goes and the label carries the state', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?paysAfter=0');
    const root = surface(page);
    await expect(root.locator('.abc-qr')).toBeVisible();
    const animation = await root
      .locator('.abc-life')
      .evaluate((node) => getComputedStyle(node, '::before').transitionDuration);
    metric('motion.reduced.transition', animation);
    expect(animation).toBe('0.12s');
  });

  test('prefers-contrast: more forces pure black and white on the code', async ({ page }) => {
    await page.emulateMedia({ contrast: 'more' });
    await page.goto('/');
    const root = surface(page);
    await expect(root.locator('.abc-qr')).toBeVisible();
    const colors = await root.locator('.abc-code').evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, ink: style.color };
    });
    metric('contrast.more.code', `${colors.background}|${colors.ink}`);
    expect(colors.background).toBe('rgb(255, 255, 255)');
    expect(colors.ink).toBe('rgb(0, 0, 0)');
  });

  test('forced-colors: the fill goes and the label still says everything', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/');
    const root = surface(page);
    const copy = root.locator('.abc-btn.is-copy');
    await expect(copy).toBeVisible();
    const display = await copy
      .locator('.abc-btn-fill')
      .evaluate((node) => getComputedStyle(node).display);
    metric('forcedColors.fill.display', display);
    expect(display).toBe('none');
    await expect(copy).toHaveText(/Copiar código/);
  });

  test('dark host: the code keeps its own paper', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const root = surface(page);
    await expect(root.locator('.abc-qr')).toBeVisible();
    const code = await root.locator('.abc-code').evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, ink: style.color };
    });
    metric('dark.code', `${code.background}|${code.ink}`);
    expect(code.background).not.toBe('rgba(0, 0, 0, 0)');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the merchant delivers the BR Code as selectable text', async ({ page }) => {
    await page.goto('/');
    const noscript = page.locator('noscript');
    await expect(noscript).toHaveCount(1);
    const text = await noscript.textContent();
    metric('fallback.noscript', (text ?? '').trim().slice(0, 40));
    expect(text ?? '').toMatch(/Pix Copia e Cola/);
    await expect(page.locator('#checkout > div')).toHaveCount(0);
  });
});
