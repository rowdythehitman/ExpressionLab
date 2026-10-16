// The After Effects panel build (dist-panel/, `npm run build:panel`) loaded from file:// like CEP does,
// with a fake __adobe_cep__ that runs the real cep/host/host.jsx against a small fake AE. It also removes
// structuredClone and Array.prototype.at, which CEP 11's Chromium 88 doesn't have.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const INDEX = resolve('dist-panel/index.html');
const HOST_JSX = readFileSync(resolve('cep/host/host.jsx'), 'utf8');

const FAKE_AE = (hostJsx: string) => {
  const w = window as unknown as Record<string, unknown>;
  delete w.structuredClone;
  delete (Array.prototype as unknown as Record<string, unknown>).at;
  class CompItem {}
  class TextLayer {}
  const PropertyType = { PROPERTY: 6812, NAMED_GROUP: 6814 };
  const PropertyValueType = { NO_VALUE: 6412, OneD: 6417, TwoD: 6418, TwoD_SPATIAL: 6419, ThreeD: 6414, ThreeD_SPATIAL: 6415, COLOR: 6416 };
  const layer = { name: 'Logo', index: 1, threeDLayer: false };
  const transform = { name: 'Transform', matchName: 'ADBE Transform Group' };
  const makeProp = (name: string, matchName: string, vt: number) => ({
    name, matchName, propertyType: 6812, propertyValueType: vt, canSetExpression: true,
    expression: '', expressionEnabled: false, expressionError: '', propertyDepth: 2,
    propertyGroup: (n: number) => (n >= 2 ? layer : transform),
  });
  const props = { position: makeProp('Position', 'ADBE Position', 6415), opacity: makeProp('Opacity', 'ADBE Opacity', 6417) };
  const comp = Object.assign(new CompItem(), { name: 'Main', selectedProperties: [props.position] });
  const calls: string[] = [];
  Object.assign(w, {
    CompItem, TextLayer, PropertyType, PropertyValueType,
    app: { project: { activeItem: comp }, beginUndoGroup() {}, endUndoGroup() {} },
    __fakeAE: { comp, props, calls },
  });
  (0, eval)(hostJsx);
  w.__adobe_cep__ = {
    evalScript(src: string, cb: (r: string) => void) {
      calls.push(src);
      let r: string;
      try {
        r = String((0, eval)(src));
      } catch {
        r = 'EvalScript error.';
      }
      setTimeout(() => cb(r));
    },
  };
};

test.skip(!existsSync(INDEX) && !process.env.CI, 'run `npm run build:panel` first');

test('AE panel: apply, use selected property, load from selected, create globals', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(FAKE_AE, HOST_JSX);
  await page.goto(`file://${INDEX}`);
  await expect(page.locator('.ae-node').first()).toBeVisible();

  // Apply: the embedded expression lands on the selected property.
  await page.getByRole('button', { name: 'Apply to selected' }).click();
  await expect(page.getByRole('status')).toHaveText('Applied to Logo › Position');
  const applied = await page.evaluate(() => (window as never as { __fakeAE: { props: { position: { expression: string; expressionEnabled: boolean } } } }).__fakeAE.props.position);
  expect(applied.expressionEnabled).toBe(true);
  expect(applied.expression).toContain('//@ae-nodes:v1:');
  await expect(page.locator('.cm-content')).toContainText(applied.expression.split('\n')[0]!);

  // Use selected property: select Opacity in the "timeline", and the target follows.
  await page.evaluate(() => {
    const ae = (window as never as { __fakeAE: { comp: { selectedProperties: unknown[] }; props: Record<string, unknown> } }).__fakeAE;
    ae.comp.selectedProperties = [ae.props.opacity];
  });
  await page.getByRole('button', { name: 'Use selected property' }).click();
  await expect(page.getByLabel('Target property')).toHaveValue('opacity');
  await expect(page.getByRole('status')).toContainText('Target: Opacity, from Logo › Opacity');

  // Load from selected: the graph embedded in Position's expression opens as a new tab.
  await page.evaluate(() => {
    const ae = (window as never as { __fakeAE: { comp: { selectedProperties: unknown[] }; props: Record<string, unknown> } }).__fakeAE;
    ae.comp.selectedProperties = [ae.props.position];
  });
  await page.getByRole('button', { name: 'Load from selected' }).click();
  await expect(page.getByRole('tablist', { name: 'Expressions' }).getByRole('tab')).toHaveCount(2);

  // Create globals in comp runs the generated setup script in AE.
  await page.locator('summary', { hasText: 'File' }).click();
  await page.getByRole('button', { name: 'Create globals in comp' }).click();
  await expect.poll(() => page.evaluate(() => (window as never as { __fakeAE: { calls: string[] } }).__fakeAE.calls.some((c) => c.includes('ensureNull(')))).toBe(true);

  expect(errors).toEqual([]);
});

test('the web build shows no AE buttons', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.ae-node').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply to selected' })).toHaveCount(0);
});
