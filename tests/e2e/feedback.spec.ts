import { expect, test, type Page } from '@playwright/test';

const head = (page: Page, title: RegExp) =>
  page.locator('.ae-node-head', { has: page.locator('.ae-node-name', { hasText: title }) });
const nodeWith = (page: Page, title: RegExp) => page.locator('.ae-node', { has: head(page, title) });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.ae-node').first()).toBeVisible();
});

test('copy, paste at the mouse, duplicate and undo nodes', async ({ page }) => {
  await head(page, /^Wiggle$/).click();
  await head(page, /^Wiggle Amp/).click({ modifiers: ['Shift'] });
  await expect(page.locator('.inspector h2')).toHaveText(/2 nodes selected/i);
  await page.keyboard.press('Control+c');
  await page.locator('.react-flow__pane').hover({ position: { x: 300, y: 650 } });
  await page.keyboard.press('Control+v');
  await expect(page.locator('.ae-node')).toHaveCount(8);
  // The pasted pair keeps its wire (amp → wiggle.amp): 4 original edges + 1.
  await expect(page.locator('.react-flow__edge')).toHaveCount(5);
  await page.keyboard.press('Control+d');
  await expect(page.locator('.ae-node')).toHaveCount(10);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.ae-node')).toHaveCount(6);
});

test('dropping a wire on empty canvas offers only compatible nodes, connected', async ({ page }) => {
  const src = nodeWith(page, /^Wiggle Freq/).locator('.react-flow__handle.source');
  const b = (await src.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(700, 780, { steps: 10 });
  await page.mouse.up();
  const qa = page.getByRole('dialog', { name: 'Add node' });
  await expect(qa).toBeVisible();
  // A number can't feed Split Vec2, so it isn't offered.
  await qa.locator('input').fill('split');
  await expect(qa.locator('li')).toHaveText(['No node can take this wire']);
  await qa.locator('input').fill('round');
  await expect(qa.locator('li').first()).toContainText('→ A');
  await qa.locator('input').press('Enter');
  await expect(page.locator('.react-flow__edge')).toHaveCount(5);
  await expect(page.locator('.inspector .insp-row').first()).toContainText('← Wiggle Freq');
});

test('inspector: name shows the emitted identifier, colour and previewer toggle', async ({ page }) => {
  await head(page, /^Wiggle$/).click();
  await expect(page.locator('#var-help')).toContainText('wiggle1');
  await page.getByLabel('Name', { exact: true }).fill('Shake');
  await expect(page.locator('#var-help')).toContainText('shake');
  await expect(page.locator('.cm-content')).toContainText('const shake = wiggle(');
  await page.locator('.swatch-btn[aria-label="#2f4b7e"]').click();
  await expect(head(page, /^Shake/)).toHaveCSS('background-color', 'rgb(47, 75, 126)');
  await page.getByLabel('Add to Previewer').check();
  await expect(head(page, /^Shake/).locator('.ae-node-preview.on')).toBeVisible();
});

test('output preview: scrub time, override a node, adjust a control', async ({ page }) => {
  await head(page, /^Wiggle$/).click();
  await page.getByLabel('Add to Previewer').check();
  await head(page, /^Wiggle Amp/).click();
  await page.getByLabel('Add to Previewer').check();
  await page.getByRole('tab', { name: 'Preview' }).click();

  const out = page.locator('.preview-value');
  await expect(out).toHaveText(/^\[\d/);
  const atZero = await out.innerText();
  await page.getByLabel('Time (seconds)').fill('1.5');
  await expect(out).not.toHaveText(atZero);
  await expect(page.locator('.curve path')).toHaveCount(2);

  // Amp 0 → no wiggle: the output equals the property value.
  await page.getByLabel('Wiggle Amp preview value').fill('0');
  await expect(out).toHaveText('[960, 540]');

  // Override the wiggle's result directly.
  const row = page.locator('.preview-node').filter({ has: page.locator('strong', { hasText: /^Wiggle$/ }) });
  await row.getByLabel('Override').check();
  await row.locator('input:not([type=checkbox])').fill('1, 2');
  await expect(out).toHaveText('[1, 2]');
});
