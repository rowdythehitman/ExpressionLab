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
