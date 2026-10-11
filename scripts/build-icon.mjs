// Maintainer-only generation: the app, installers and Explorer share the web logo.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  channel: 'chromium',
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
try {
  const page = await browser.newPage({
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 1,
  });
  const svg = await readFile('public/favicon.svg', 'utf8');
  await page.setContent(
    `<style>html,body{margin:0;width:512px;height:512px;background:transparent}svg{display:block;width:512px;height:512px}</style>${svg}`,
  );
  await page.screenshot({ path: resolve('build/icon.png'), omitBackground: true });
} finally {
  await browser.close();
}
console.log(
  'Generated build/icon.png from public/favicon.svg. Rebuild and sign Windows shell assets after changing the logo.',
);
