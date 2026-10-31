import { expect, test } from '@playwright/test';

const selected = (page: import('@playwright/test').Page) => page.locator('.panel-id');

test('a deep link opens the passage in its part', async ({ page }) => {
  await page.goto('./#IV.prop.20.proof');

  await expect(selected(page)).toHaveText('IV.prop.20.proof');
  await expect(page.locator('[data-element-id="IV.prop.20.proof"]')).toHaveClass(/selected/);
  await expect(page.locator('[data-element-id="IV.prop.20.proof"]')).toBeInViewport();
  await expect(page).toHaveURL(/#IV\.prop\.20\.proof$/);
});

test('a deep link never renders Part I first', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', request => requested.push(request.url()));

  await page.goto('./#III.prop.6');
  await expect(selected(page)).toHaveText('III.prop.6');

  expect(requested.some(url => url.endsWith('ethica_1.xml'))).toBe(false);
});

test('the current part survives a reload', async ({ page }) => {
  await page.goto('./');
  await page.locator('.part-button').nth(2).click();
  await expect(page.locator('[data-element-id="III.prop.6"]')).toBeVisible();
  await expect(page).toHaveURL(/#III$/);

  await page.reload();

  await expect(page.locator('[data-element-id="III.prop.6"]')).toBeVisible();
  await expect(page.locator('.part-button.active')).toContainText('Part III');
});

test('back and forward step through parts and passages', async ({ page }) => {
  await page.goto('./');
  await page.locator('[data-element-id="I.def.3"]').click();
  await expect(selected(page)).toHaveText('I.def.3');

  await page.locator('.part-button').nth(1).click();
  await expect(page.locator('[data-element-id="II.prop.7"]')).toBeVisible();

  await page.goBack();
  await expect(selected(page)).toHaveText('I.def.3');
  await expect(page.locator('.part-button.active')).toContainText('Part I');

  await page.goBack();
  await expect(page.locator('.reasoning-panel.empty')).toBeVisible();

  await page.goForward();
  await page.goForward();
  await expect(page.locator('.part-button.active')).toContainText('Part II');
  await expect(page.locator('[data-element-id="II.prop.7"]')).toBeVisible();
});

test('a relationship link crosses parts', async ({ page }) => {
  await page.goto('./#III.prop.6.proof');
  await expect(selected(page)).toHaveText('III.prop.6.proof');

  await page.locator('.relationship-chip', { hasText: 'I.prop.34' }).first().click();

  await expect(selected(page)).toHaveText('I.prop.34');
  await expect(page.locator('.part-button.active')).toContainText('Part I');
  await expect(page.locator('[data-element-id="I.prop.34"]')).toBeInViewport();
});

test('editing the hash navigates', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('[data-element-id="I.def.1"]')).toBeVisible();

  await page.evaluate(() => {
    window.location.hash = '#II.prop.7';
  });

  await expect(selected(page)).toHaveText('II.prop.7');
});

for (const [name, hash, part] of [
  ['unknown text', '#garbage', 'Part I'],
  ['malformed encoding', '#%E0%A4%A', 'Part I'],
  ['selector metacharacters', '#I.prop."]x', 'Part I'],
  ['a missing passage', '#III.prop.999', 'Part III']
] as const) {
  test(`a hash with ${name} falls back safely`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(`./${hash}`);

    await expect(page.locator('.part-button.active')).toContainText(part);
    await expect(page.locator('.reasoning-panel.empty')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
