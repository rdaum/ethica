import { expect, test } from '@playwright/test';

const charactersOnFirstLine = (paragraph: HTMLElement) => {
  const text = paragraph.firstChild as Text;
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 1);
  const firstLineTop = range.getBoundingClientRect().top;

  for (let index = 1; index < text.length; index += 1) {
    range.setStart(text, index);
    range.setEnd(text, index + 1);
    if (range.getBoundingClientRect().top > firstLineTop + 4) {
      return index;
    }
  }

  return text.length;
};

test('body text keeps a readable line length', async ({ page }) => {
  await page.goto('./');
  const paragraph = page.locator('[data-element-id="I.prop.8.note2"] .entry-body p').first();
  await paragraph.scrollIntoViewIfNeeded();
  const characters = await paragraph.evaluate(charactersOnFirstLine);

  expect(characters).toBeGreaterThan(45);
  expect(characters).toBeLessThanOrEqual(78);
});

test('reference IDs appear only when reaching for a passage', async ({ page }) => {
  await page.goto('./');
  const passage = page.locator('[data-element-id="I.def.3"]');
  const id = passage.locator('.entry-id');

  await expect(id).toHaveCSS('opacity', '0');
  await passage.hover();
  await expect(id).toHaveCSS('opacity', '1');
});

test('focus mode leaves only the text until a passage is selected', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Focus' }).click();

  await expect(page.locator('.reader-sidebar')).toBeHidden();
  await expect(page.locator('.reasoning-panel')).toBeHidden();

  await page.locator('[data-element-id="I.def.3"]').click();
  await expect(page.locator('.panel-id')).toHaveText('I.def.3');
  await expect(page.locator('.reasoning-panel')).toBeVisible();
  await expect(page.locator('.reader-sidebar')).toBeHidden();

  await page.reload();
  await expect(page.locator('.reader-sidebar')).toBeHidden();

  await page.getByRole('button', { name: 'Focus' }).click();
  await expect(page.locator('.reader-sidebar')).toBeVisible();
});

test('a section link lands below the top bar', async ({ page }) => {
  await page.goto('./');
  await page.locator('.section-links button', { hasText: 'Propositions' }).click();

  const heading = page.locator('[data-section-kind="propositions"]').first();
  await expect(heading).toBeInViewport();
  await expect
    .poll(async () => {
      const box = await heading.boundingBox();
      const bar = await page.locator('.topbar').boundingBox();
      return box!.y >= bar!.y + bar!.height - 1 && box!.y < 200;
    })
    .toBe(true);
});

test('dark mode follows the system setting', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await expect(page.locator('[data-element-id="I.def.1"]')).toBeVisible();

  const [background, text] = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return [style.backgroundColor, style.color];
  });

  expect(background).toBe('rgb(27, 24, 21)');
  expect(text).toBe('rgb(233, 225, 211)');
});

test.describe('on a medium screen', () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test('the analysis sits beside the text and never covers it', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.reader-sidebar')).toBeVisible();
    await expect(page.locator('.reasoning-panel')).toBeHidden();

    await page.locator('[data-element-id="I.def.3"]').click();
    await expect(page.locator('.panel-id')).toHaveText('I.def.3');
    await expect(page.locator('.reader-sidebar')).toBeHidden();

    const text = await page.locator('.book-view').boundingBox();
    const panel = await page.locator('.reasoning-panel').boundingBox();
    expect(text!.x + text!.width).toBeLessThanOrEqual(panel!.x);

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.reader-sidebar')).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the book comes first, without sideways scrolling', async ({ page }) => {
    await page.goto('./');
    const passage = page.locator('[data-element-id="I.def.1"]');
    await expect(passage).toBeInViewport();
    await expect(page.locator('.reader-sidebar')).toBeHidden();

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflows).toBe(false);
  });

  test('contents open as a sheet and change part', async ({ page }) => {
    await page.goto('./');
    const toggle = page.getByRole('button', { name: 'Contents' });
    await toggle.click();
    await expect(page.locator('.reader-sidebar')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.reader-sidebar')).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page.locator('.part-button').nth(2).click();
    await expect(page.locator('.reader-sidebar')).toBeHidden();
    await expect(page.locator('[data-element-id="III.prop.6"]')).toBeAttached();
    await expect(page).toHaveURL(/#III$/);
  });

  test('search opens on request and filters the text', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('searchbox')).toBeHidden();

    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('searchbox')).toBeFocused();
    await page.getByRole('searchbox').fill('self-caused');
    await expect(page.locator('[data-element-id="I.def.1"]')).toBeVisible();
    await expect(page.locator('[data-element-id="I.def.2"]')).toHaveCount(0);
  });

  test('a selected passage opens the analysis as a bottom sheet', async ({ page }) => {
    await page.goto('./');
    await page.locator('[data-element-id="I.def.1"]').click();

    const sheet = page.locator('.reasoning-panel');
    await expect(sheet).toHaveCSS('position', 'fixed');
    const box = await sheet.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(844 / 2 - 1);
    expect(box!.y + box!.height).toBeCloseTo(844, 0);
  });
});
