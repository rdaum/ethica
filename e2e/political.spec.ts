import { expect, test } from '@playwright/test';

const entry = (id: string) => `[data-element-id="${id}"]`;

test.describe('Political Treatise', () => {
  test('switches work from the sidebar and returns to the Ethics', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1, name: 'The Ethics' })).toBeVisible();

    await page.getByRole('button', { name: 'Political Treatise' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Political Treatise' })).toBeVisible();
    await expect(page).toHaveURL(/#TP$/);
    await expect(page.getByText('Spinoza, translated by A.H. Gosset')).toBeVisible();
    await expect(page.locator(entry('TP.preface'))).toContainText('Dear Friend');
    await expect(page.locator('.part-button')).toHaveCount(11);

    await page.getByRole('button', { name: 'The Ethics' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'The Ethics' })).toBeVisible();
    await expect(page.locator('.part-button')).toHaveCount(5);
  });

  test('opens a section from its URL, and back and forward cross between works', async ({ page }) => {
    await page.goto('./#TP.VII.6');
    await expect(page.locator(`${entry('TP.VII.6')}.selected`)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Of monarchy (continuation)' })).toBeVisible();

    await page.goto('./#I');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Political Treatise' })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'The Ethics' })).toBeVisible();
  });

  test('links between the two works, marking the link as the editor’s', async ({ page }) => {
    await page.goto('./#III.prop.29');
    const group = page.locator('.relationship-group', { hasText: 'linked here by the 1883 editor' });
    await group.getByRole('button', { name: 'Pol. Treatise VII, § 6' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Political Treatise' })).toBeVisible();
    await expect(page.locator(`${entry('TP.VII.6')}.selected`)).toBeVisible();
    await expect(page).toHaveURL(/#TP\.VII\.6$/);

    await page.locator('.relationship-group', { hasText: 'supplied by the 1883 editor' }).getByRole('button').click();
    await expect(page.getByRole('heading', { level: 1, name: 'The Ethics' })).toBeVisible();
    await expect(page.locator(`${entry('III.prop.29')}.selected`)).toBeVisible();
  });

  test('follows a citation within the treatise, and hides demonstration counts', async ({ page }) => {
    await page.goto('./#TP.III.2');
    await expect(page.locator('.connection-stat')).toHaveCount(2);
    await page.getByRole('button', { name: 'Pol. Treatise II, § 15' }).first().click();
    await expect(page.locator(`${entry('TP.II.15')}.selected`)).toBeVisible();
  });

  test('offers Latin in parallel, labels it, and searches it', async ({ page }) => {
    await page.goto('./#TP.II');
    await page.getByRole('group', { name: 'Compare with' }).getByRole('button', { name: 'Latin' }).click();
    await expect(page.locator(entry('TP.II.1'))).toContainText('In nostro Tractatu');
    await expect(page.locator(entry('TP.II.1'))).toContainText('In our Theologico-Political Treatise');

    await page.getByRole('group', { name: 'Read in' }).getByRole('button', { name: 'Latin' }).click();
    await expect(page.getByRole('button', { name: 'Articulus 2', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Of natural right' })).toBeVisible();

    await page.getByRole('searchbox').fill('peccatum');
    await expect(page.locator(entry('TP.II.18'))).toBeVisible();
    await expect(page.locator(entry('TP.II.2'))).toHaveCount(0);
  });

  test('falls back from French without losing the preference', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('group', { name: 'Read in' }).getByRole('button', { name: 'Français' }).click();
    await page.getByRole('button', { name: 'Traité politique' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Political Treatise' })).toBeVisible();
    await expect(page.getByText('n’est pas encore disponible en français')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Read in' }).getByRole('button')).toHaveCount(2);

    await page.getByRole('button', { name: 'The Ethics' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'L’Éthique' })).toBeVisible();
  });

  test('the long title fits whole beside the top bar buttons on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 381, height: 800 });
    await page.goto('./#TP.II');
    const title = page.getByRole('heading', { level: 1, name: 'Political Treatise' });
    await expect(title).toBeVisible();
    const fits = await title.evaluate(node => node.scrollWidth <= node.clientWidth);
    const titleBox = await title.boundingBox();
    const searchBox = await page.getByRole('button', { name: 'Search' }).boundingBox();
    const topbarBox = await page.locator('.topbar').boundingBox();
    expect(fits).toBe(true);
    expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(searchBox!.x);
    expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(topbarBox!.y + topbarBox!.height);
  });

  test('two language buttons fill the row', async ({ page }) => {
    await page.goto('./#TP.II');
    const row = await page.getByRole('group', { name: 'Read in' }).locator('.reading-mode-buttons').boundingBox();
    const last = await page.getByRole('group', { name: 'Read in' }).getByRole('button', { name: 'Latin' }).boundingBox();
    expect(Math.abs(last!.x + last!.width - (row!.x + row!.width))).toBeLessThanOrEqual(2);
  });

  test('does not overflow a phone screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await page.goto('./#TP.II');
    await expect(page.locator(entry('TP.II.1'))).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
