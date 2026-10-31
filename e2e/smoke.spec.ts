import { expect, test } from '@playwright/test';

test('loads Part I and shows analysis for a selected passage', async ({ page }) => {
  await page.goto('./');

  const passage = page.locator('[data-element-id="I.def.3"]');
  await expect(passage).toBeVisible();
  await passage.click();

  await expect(page.locator('.panel-id')).toHaveText('I.def.3');
  await expect(page.locator('.panel-section').first()).toBeVisible();
});

test('switches to another part with the worker running', async ({ page }) => {
  await page.goto('./');
  await page.locator('.part-button').nth(2).click();

  await expect(page.locator('[data-element-id="III.prop.6"]')).toBeVisible();
});
