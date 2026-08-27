import { expect, test } from '@playwright/test';

const surface = '#checkout > div';

test('the merchant page gets a shadow root, and the host CSS cannot reach into it', async ({ page }) => {
  await page.goto('/');
  const host = page.locator(surface);
  await expect(host).toHaveAttribute('role', 'group');

  const isolated = await host.evaluate((node) => node.shadowRoot !== null);
  expect(isolated, 'the surface must be isolated in both directions').toBe(true);

  await page.addStyleTag({ content: 'button, p, code { display: none !important; color: red; }' });
  await expect(page.locator(`${surface} >> .abc-status`)).toBeVisible();
});

test('the charge arrives, prints its code at real scale and counts down', async ({ page }) => {
  await page.goto('/');
  const root = page.locator(surface);

  await expect(root.locator('.abc-status')).toHaveText('Aguardando pagamento');
  await expect(root.locator('.abc-qr')).toBeVisible();
  await expect(root.locator('.abc-payload-value')).toContainText('br.gov.bcb.pix');

  const due = root.locator('.abc-due');
  await expect(due).toHaveText(/vence em \d\d:\d\d/);
  const first = await due.textContent();
  await page.waitForTimeout(1500);
  expect(await due.textContent(), 'the deadline is a live quantity').not.toBe(first);

  const fill = await root.locator('.abc-life').evaluate((node) =>
    Number(getComputedStyle(node).getPropertyValue('--fill')),
  );
  expect(fill).toBeGreaterThan(0.9);
  expect(fill).toBeLessThanOrEqual(1);
});

test('copying puts the payload on the clipboard and the control turns inside out', async ({ page }) => {
  await page.goto('/');
  const root = page.locator(surface);
  const copy = root.locator('.abc-btn.is-copy');

  await expect(copy).toHaveText(/Copiar código/);
  await copy.click();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('br.gov.bcb.pix');
  expect(clipboard).toBe(await root.locator('.abc-payload-value').textContent());

  await expect(copy.locator('.abc-btn-fill')).toHaveText('Código copiado');
  const filled = await copy.evaluate((node) => Number(getComputedStyle(node).getPropertyValue('--fill')));
  expect(filled).toBe(1);
});

test('the surface is operable and announced without a mouse', async ({ page }) => {
  await page.goto('/');
  const root = page.locator(surface);

  await expect(root.locator('.abc-status')).toHaveAttribute('aria-live', 'polite');
  await expect(root.locator('.abc-qr')).toHaveAttribute('aria-label', 'QR code do Pix');

  await page.keyboard.press('Tab');
  const focusedText = await page.evaluate(() => {
    const host = document.querySelector('#checkout > div');
    const active = host?.shadowRoot?.activeElement;
    return active === null || active === undefined ? null : active.textContent;
  });
  expect(focusedText, 'the copy control is the first stop').toContain('Copiar código');

  await page.keyboard.press('Enter');
  await expect(root.locator('.abc-btn.is-copy .abc-btn-fill')).toHaveText('Código copiado');
});

test('the payment lands, the rule fills in chroma and the receipt replaces the code', async ({ page }) => {
  const indicated: string[] = [];
  page.on('console', (message) => indicated.push(message.text()));

  await page.goto('/');
  const root = page.locator(surface);

  await expect(root.locator('.abc-status')).toHaveText('Concluída', { timeout: 20_000 });
  await expect(root.locator('.abc-notice-value')).toHaveText(/^E\d/);
  await expect(root.locator('.abc-qr')).toHaveCount(0, );
  await expect(root.locator('.abc-note')).toHaveText(/Recebemos a confirmação/);

  const tone = await root.locator('.abc-life').getAttribute('class');
  expect(tone).toContain('is-ok');
});

test('a hidden tab is not polled', async ({ page }) => {
  let reads = 0;
  await page.route('**/status', async (route) => {
    reads += 1;
    await route.continue();
  });

  await page.goto('/');
  await expect(page.locator(`${surface} >> .abc-qr`)).toBeVisible();
  const before = reads;

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(4000);
  expect(reads, 'a throttled tab is not a person waiting for an answer').toBeLessThanOrEqual(before + 1);
});

test('nothing shifts the merchant page as the state changes', async ({ page }) => {
  await page.goto('/');
  const shift = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (!entry.hadRecentInput) total += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => resolve(total), 6000);
      }),
  );
  expect(shift, 'a guest that shifts its host has no defence').toBeLessThan(0.01);
});
