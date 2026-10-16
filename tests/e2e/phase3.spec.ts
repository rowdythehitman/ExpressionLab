import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.ae-node').first()).toBeVisible();
});

test('presets are grouped and the new ones compile', async ({ page }) => {
  const menu = page.getByRole('combobox', { name: 'Presets' });
  await expect(menu.locator('optgroup')).toHaveCount(6);
  await menu.selectOption('marker-fade');
  await expect(page.locator('.cm-content')).toContainText('const faded = Math.min(fadeIn, fadeOut);');
  await menu.selectOption('ignore-parent-scale');
  await expect(page.locator('.cm-content')).toContainText('while (ignoreParentScale_p.hasParent)');
  await expect(page.locator('.diag.error')).toHaveCount(0);
});

test('downloads an AE setup script for the globals', async ({ page }) => {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '⬇ Setup script' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('expressionlab-setup.jsx');
  const js = readFileSync((await file.path())!, 'utf8');
  expect(js).toContain('ensureNull("GLOBALS", false)');
  expect(js).toContain('ensureControl(globalsLayer, "Wiggle Freq", "ADBE Slider Control"');
});

const head = (page: import('@playwright/test').Page, t: RegExp) =>
  page.locator('.ae-node-head', { has: page.locator('.ae-node-name', { hasText: t }) });

test('select nodes → Make macro → same output; Ungroup restores them', async ({ page }) => {
  const code = page.locator('.cm-content');
  await head(page, /^Wiggle Freq$/).click();
  await head(page, /^Wiggle Amp$/).click({ modifiers: ['Shift'] });
  await head(page, /^Wiggle$/).click({ modifiers: ['Shift'] });
  await page.getByPlaceholder('Macro name').fill('Shaker');
  await page.getByRole('button', { name: 'Make macro' }).click();
  await expect(page.locator('.ae-node')).toHaveCount(4);
  await expect(page.locator('.ae-node-chip', { hasText: 'Shaker' })).toBeVisible();
  await expect(code).toContainText('const shakerWiggle = wiggle(wiggleFreq, wiggleAmp, 1, 0.5);');
  await expect(page.locator('.diag.error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ungroup' }).click();
  await expect(page.locator('.ae-node')).toHaveCount(6);
});

test('custom nodes: invalid JSON is explained, a valid node lands in the palette and compiles', async ({ page }) => {
  await page.getByRole('button', { name: '★ Custom nodes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Custom nodes' });
  await dialog.getByRole('button', { name: '+ New node' }).click();
  const editor = dialog.locator('.json-editor .cm-content');
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('{"id":"user.half","label":"Half","category":"math","description":"a / 2","tags":[],"inputs":[{"id":"a","label":"A","type":"number","default":10}],"outputs":[{"id":"out","label":"R","type":"number","expr":"{{in.b}} / 2"}]}');
  await expect(dialog.locator('.custom-problems')).toContainText("{{in.b}} doesn't match any declared input");
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('{"id":"user.half","label":"Half","category":"math","description":"a / 2","tags":[],"inputs":[{"id":"a","label":"A","type":"number","default":10}],"outputs":[{"id":"out","label":"R","type":"number","expr":"{{in.a}} / 2"}]}');
  await dialog.getByRole('button', { name: 'Add node' }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await page.locator('.palette .search').fill('half');
  await page.locator('.palette-item', { hasText: 'Half' }).click();
  // Wire Half into Wiggle's Amount with the wire-drop quick-add flow's sibling: drag output → input.
  const src = page.locator('.ae-node', { has: page.locator('.ae-node-chip', { hasText: 'Half' }) }).locator('.react-flow__handle.source');
  const dst = page.locator('.ae-node', { has: page.locator('.ae-node-name', { hasText: /^Wiggle$/ }) }).locator('.react-flow__handle[data-handleid="amp"]');
  await src.dragTo(dst);
  await expect(page.locator('.cm-content')).toContainText('const half = 10 / 2;');
});
