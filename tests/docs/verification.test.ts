import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { verificationMarkdown } from '../../src/core/verification';

const file = new URL('../../docs/ae-verification.md', import.meta.url);

it('docs/ae-verification.md is up to date (npm run gen:verify)', () => {
  const md = verificationMarkdown();
  if (process.env.UPDATE_VERIFY) writeFileSync(file, md);
  expect(readFileSync(file, 'utf8')).toBe(md);
});
