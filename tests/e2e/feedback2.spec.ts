import { expect, test, type Page } from '@playwright/test';

const nodeByName = (page: Page, name: RegExp) =>
  page.locator('.ae-node', { has: page.locator('.ae-node-name', { hasText: name }) });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.ae-node').first()).toBeVisible();
});

test('node header shows [Type] then a renamable name', async ({ page }) => {
  const wiggle = nodeByName(page, /^Wiggle$/);
  await expect(wiggle.locator('.ae-node-chip')).toHaveText('Wiggle');
  await wiggle.locator('.ae-node-name').dblclick();
  const input = page.getByLabel('Node name');
  await input.fill('Camera Shake');
  await input.press('Enter');
  await expect(nodeByName(page, /^Camera Shake$/).locator('.ae-node-chip')).toHaveText('Wiggle');
  await expect(page.locator('.cm-content')).toContainText('const cameraShake = wiggle(');

  // Clearing the name restores the default; F2 renames the selected node.
  await nodeByName(page, /^Camera Shake$/).locator('.ae-node-chip').click();
  await page.keyboard.press('F2');
  await page.getByLabel('Node name').fill('');
  await page.getByLabel('Node name').press('Enter');
  await expect(nodeByName(page, /^Wiggle$/)).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('const wiggle1 = wiggle(');
});

test('the circle on a node toggles it in the Output Preview', async ({ page }) => {
  const toggle = nodeByName(page, /^Wiggle$/).getByRole('button', { name: 'Add to the Output Preview' });
  await toggle.click();
  const on = nodeByName(page, /^Wiggle$/).getByRole('button', { name: 'Remove from the Output Preview' });
  await expect(on).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'Preview' }).click();
  await expect(page.locator('.preview-node')).toHaveCount(1);
  await on.click();
  await expect(page.locator('.preview-node')).toHaveCount(0);
});

test('Globals dialog: rename the null, add a layer with its own control', async ({ page }) => {
  await expect(page.locator('.cm-content')).toContainText('const GLOBALS = thisComp.layer("GLOBALS");');
  await page.getByRole('button', { name: /Globals/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Globals' });

  await dialog.getByRole('region', { name: 'Globals null' }).getByLabel('Layer name').fill('Rig');
  await dialog.getByRole('button', { name: '+ Add layer' }).click();
  const layer = dialog.getByRole('region', { name: /^Layer / });
  await layer.getByLabel('Name in AE').fill('Title');
  await layer.getByLabel('Variable').fill('titleLayer');
  await layer.getByRole('button', { name: 'Checkbox', exact: true }).click();
  await layer.getByLabel('Effect name').fill('Show Title');
  await dialog.getByRole('button', { name: 'Close' }).click();

  await expect(page.locator('.chip', { hasText: 'Show Title' })).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('const Rig = thisComp.layer("Rig");');

  // Wire the new control in and check it's read from its own layer.
  await page.locator('.ae-node-name', { hasText: /^Wiggle Amp$/ }).dblclick();
  await page.getByLabel('Node name').press('Escape');
  await page.locator('.ae-node', { has: page.locator('.ae-node-name', { hasText: /^Wiggle Amp$/ }) })
    .getByRole('combobox', { name: 'Control' }).selectOption({ label: 'Show Title (Checkbox Control)' });
  await expect(page.locator('.cm-content')).toContainText('const titleLayer = thisComp.layer("Title");');
  await expect(page.locator('.cm-content')).toContainText('titleLayer.effect("Show Title")("Checkbox")');
});
