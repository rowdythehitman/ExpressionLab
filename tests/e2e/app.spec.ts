import { expect, test, type Page } from '@playwright/test';

const code = (page: Page) => page.locator('.cm-content');

async function paste(page: Page, text: string) {
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, text);
}

test.beforeEach(async ({ page }) => {
  // Fresh IndexedDB per test (each test gets a new context), so the default preset loads.
  await page.goto('/');
  await expect(page.locator('.ae-node').first()).toBeVisible();
});

test('compiles the default preset and copies it with an embedded graph', async ({ page }) => {
  await expect(code(page)).toContainText('const wiggle1 = wiggle(wiggleFreq, wiggleAmp, 1, 0.5);');
  await expect(page.locator('.payload-note')).toContainText('embedded graph');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.split('\n').at(-1)).toMatch(/^\/\/@ae-nodes:v1:/);
  await page.getByRole('button', { name: 'Copy clean' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain('@ae-nodes');
});

test('paste-back imports the graph as a new tab, warning about hand edits', async ({ page }) => {
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());

  await paste(page, clip);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { selected: true })).toHaveText('Posterize Time + Wiggle (imported)');

  await paste(page, clip.replace('1, 0.5)', '3, 0.5)'));
  await expect(page.getByRole('dialog')).toContainText('edited by hand');
  await page.getByRole('button', { name: 'Load graph anyway' }).click();
  await expect(page.getByRole('tab')).toHaveCount(3);

  await page.getByRole('button', { name: 'Paste expression' }).click();
  await page.getByRole('dialog').locator('textarea').fill('wiggle(2, 50)');
  await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('alert')).toContainText('No embedded graph');
});

test('refuses a wrong-type connection and inserts a converter', async ({ page }) => {
  await page.locator('.palette .search').fill('comp center');
  await page.locator('.palette-item', { hasText: 'Comp Center' }).click();
  const center = page.locator('.ae-node', { hasText: 'Comp Center' });
  await center.locator('.ae-node-head').dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: 150, y: 120 } });
  await page.locator('.react-flow__controls-fitview').click();

  const src = center.locator('.react-flow__handle.source');
  const dst = page.locator('.ae-node', { hasText: 'Wiggle' }).filter({ hasText: 'Freq' }).locator('.react-flow__handle[data-handleid="freq"]');
  await src.dragTo(dst);
  await expect(page.locator('.connect-error')).toContainText('Expected number, got vec2');
  await page.locator('.connect-error').getByRole('button', { name: /Insert/ }).click();
  await expect(code(page)).toContainText('const pickComponent = [thisComp.width / 2, thisComp.height / 2][0];');
});

test('Tab opens quick-add at the cursor', async ({ page }) => {
  const before = await page.locator('.ae-node').count();
  await page.locator('.react-flow__pane').hover({ position: { x: 100, y: 500 } });
  await page.keyboard.press('Tab');
  const box = page.getByRole('dialog', { name: 'Add node' });
  await box.locator('input').fill('noise');
  await box.locator('input').press('Enter');
  await expect(page.locator('.ae-node')).toHaveCount(before + 1);
  await expect(page.locator('.ae-node', { hasText: 'Noise' })).toBeVisible();
});

test('source map links nodes and code lines both ways', async ({ page }) => {
  await page.locator('.ae-node', { hasText: 'Amount' }).locator('.ae-node-head').click();
  await expect(page.locator('.cm-node-hl')).toHaveCount(2);
  await expect(page.locator('.cm-node-hl').first()).toContainText('// Wiggle');

  await page.locator('.cm-line', { hasText: 'const wiggleAmp' }).click();
  await expect(page.locator('.inspector h2')).toHaveText('Control');
  await expect(page.locator('.cm-node-hl').last()).toContainText('const wiggleAmp');
});

test('graph tabs: add, switch, delete, undo', async ({ page }) => {
  await page.getByRole('button', { name: 'New expression' }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(code(page)).toHaveText(/value$/);
  await page.getByRole('tab', { name: 'Posterize Time + Wiggle' }).click();
  await expect(code(page)).toContainText('wiggle1');
  await page.getByRole('tab', { name: 'Expression 2' }).click();
  await page.getByRole('button', { name: 'Delete expression' }).click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('tab')).toHaveCount(2);
});

test('inlining setting folds single-use values', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Presets' }).selectOption('wiggle-one-dimension');
  await expect(code(page)).toContainText('const newPosition = [wiggledX, baseY];');
  await page.locator('summary', { hasText: 'Settings' }).click();
  await page.getByRole('checkbox', { name: 'Inline single-use values' }).check();
  await expect(code(page)).toContainText('[wiggle1[0], value[1]]');
});

test('autosave restores the project after a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Add control' }).click();
  await page.locator('.global-editor input').first().fill('Persisted Ctl');
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('.chip', { hasText: 'Persisted Ctl' })).toBeVisible();
});
