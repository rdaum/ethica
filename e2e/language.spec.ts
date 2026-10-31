import { expect, test } from '@playwright/test';

// The picker's own labels follow the reading language.
const readIn = (page: import('@playwright/test').Page) => page.getByRole('group', { name: /^(Read in|Lire en)$/ });
const compareWith = (page: import('@playwright/test').Page) => page.getByRole('group', { name: /^(Compare with|Comparer avec)$/ });

test('reading in French changes the text, headings and credit', async ({ page }) => {
  await page.goto('./#I.prop.1');
  await readIn(page).getByRole('button', { name: 'Français' }).click();

  const passage = page.locator('[data-element-id="I.prop.1"]');
  await expect(passage.locator('.entry-body p').first()).toContainText('Une substance est antérieure en nature');
  await expect(passage.locator('.entry-body p').first()).toHaveAttribute('lang', 'fr');
  await expect(page.locator('[data-element-id="I.prop.1.proof"] h4')).toHaveText('Démonstration');
  await expect(page.locator('.book-intro h2')).toHaveText('De Dieu');
  await expect(page.locator('.part-button.active')).toContainText('Partie I');
  await expect(page.locator('.brand-text p')).toContainText('Appuhn');
  await expect(page.locator('.translation-source a')).toHaveAttribute('href', /wikisource/);
  await expect(page.locator('.selected-text')).toContainText('Une substance');
});

test('any two languages can sit side by side, and choosing the second swaps them', async ({ page }) => {
  await page.goto('./#I.prop.1');
  await readIn(page).getByRole('button', { name: 'Français' }).click();
  await compareWith(page).getByRole('button', { name: 'Latin' }).click();
  await expect(page.locator('.brand-text p')).toHaveText('Spinoza, traduit par Charles Appuhn, avec le texte latin');

  const columns = page.locator('[data-element-id="I.prop.1"] > .entry-body .parallel-column');
  await expect(columns).toHaveCount(2);
  await expect(columns.nth(0).locator('.parallel-label')).toHaveText('Français');
  await expect(columns.nth(1).locator('p[lang="la"]').last()).toContainText('Substantia');

  await readIn(page).getByRole('button', { name: 'Latin' }).click();
  await expect(columns.nth(0).locator('.parallel-label')).toHaveText('Latin');
  await expect(columns.nth(1).locator('.parallel-label')).toHaveText('Français');

  await compareWith(page).getByRole('button', { name: 'None' }).click();
  await expect(columns).toHaveCount(0);
  await readIn(page).getByRole('button', { name: 'Français' }).click();
  await compareWith(page).getByRole('button', { name: 'Latin' }).click();
  await compareWith(page).getByRole('button', { name: 'Aucune' }).click();
  await expect(columns).toHaveCount(0);
});

test('the choice survives a reload', async ({ page }) => {
  await page.goto('./');
  await readIn(page).getByRole('button', { name: 'Français' }).click();
  await page.reload();

  await expect(page.locator('.book-intro h2')).toHaveText('De Dieu');
  await expect(readIn(page).getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true');
});

test('a corrupt saved choice falls back to English', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('ethica.languages', '{"primary":"klingon"}'));
  await page.reload();
  await expect(page.locator('.book-intro h2')).toHaveText('Concerning God');
});

test('search finds French without needing the accents', async ({ page }) => {
  await page.goto('./#II');
  await readIn(page).getByRole('button', { name: 'Français' }).click();
  await page.getByRole('searchbox').fill('l\'ame humaine');
  await expect(page.locator('[data-element-id="II.prop.13"]')).toBeVisible();
  await expect(page.locator('[data-element-id="II.def.1"]')).toHaveCount(0);
});

for (const [id, french, latin] of [
  ['II.prop.13.corollary', 'Il suit de là que l’homme consiste', 'Hinc sequitur hominem'],
  ['IV.prop.50.corollary', 'Il suit de là qu’un homme', 'Hinc sequitur quod homo'],
  ['IV.prop.72.proof', 'Si un homme libre agissait', 'Si liber homo']
] as const) {
  test(`${id}, missing from the English, can still be read`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(`./#${id}`);
    const passage = page.locator(`[data-element-id="${id}"]`);
    await expect(passage).toContainText('missing from the English source text');
    await expect(page.locator('.panel-id')).toHaveText(id);
    await expect(page.locator('.relationship-chip').first()).toBeVisible();

    await readIn(page).getByRole('button', { name: 'Français' }).click();
    await expect(passage).toContainText(french);
    await readIn(page).getByRole('button', { name: 'Latin' }).click();
    await expect(passage).toContainText(latin);
    expect(errors).toEqual([]);
  });
}

test('restored English passages read to the end', async ({ page }) => {
  await page.goto('./#V.prop.10.note');
  await expect(page.locator('[data-element-id="V.prop.10.note"]')).toContainText('the commandments of reason.');
  await page.goto('./#V.preface');
  await page.reload();
  await expect(page.locator('[data-element-id="V.preface"]')).toContainText("the mind's blessedness.");
});

test('footnotes follow the language', async ({ page }) => {
  await page.goto('./#III.prop.29');
  await readIn(page).getByRole('button', { name: 'Français' }).click();
  const passage = page.locator('[data-element-id="III.prop.29"]');
  await expect(passage.locator('> .entry-body .entry-footnotes')).toContainText('Note de l’Auteur');
  await expect(passage.locator('> .entry-body .footnote-marker')).toHaveCount(1);
});

test('the interface and references follow French', async ({ page }) => {
  await page.goto('./#III.prop.29');
  await readIn(page).getByRole('button', { name: 'Français' }).click();

  await expect(page.getByRole('button', { name: 'Concentration' })).toBeVisible();
  await expect(page.locator('.section-heading h3').first()).toHaveText('Liens');
  await expect(page.locator('.close-button')).toHaveText('Fermer');
  await expect(page.locator('.relationship-chip[data-target-id="III.prop.13.note"]').first()).toHaveText('III, Prop. XIII, Scolie');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  await readIn(page).getByRole('button', { name: 'English' }).click();
  await expect(page.locator('.close-button')).toHaveText('Close');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('Latin uses the book’s own headings with the English interface', async ({ page }) => {
  await page.goto('./#I.prop.1');
  await readIn(page).getByRole('button', { name: 'Latin' }).click();

  await expect(page.locator('.book-intro h2')).toHaveText('De Deo');
  await expect(page.locator('.book-kicker')).toHaveText('Pars Prima');
  await expect(page.locator('[data-element-id="I.prop.1"] h3')).toHaveText('Propositio I');
  await expect(page.locator('[data-element-id="I.prop.1.proof"] h4')).toHaveText('Demonstratio');
  await expect(page.locator('.close-button')).toHaveText('Close');
});

test('a passage missing from the English shows what it rests on', async ({ page }) => {
  await page.goto('./#IV.prop.72.proof');
  await expect(page.locator('.relationship-chip[data-target-id="IV.prop.24"]').first()).toBeVisible();
  await expect(page.locator('.relationship-chip[data-target-id="IV.prop.31.corollary"]').first()).toBeVisible();

  await page.goto('./#II.prop.17.note');
  await page.reload();
  await expect(page.locator('.relationship-chip[data-target-id="II.prop.13.corollary"]').first()).toBeVisible();
  await page.locator('.relationship-chip[data-target-id="II.prop.13.corollary"]').first().click();
  await expect(page.locator('.panel-id')).toHaveText('II.prop.13.corollary');
  await expect(page.locator('[data-element-id="II.prop.13.corollary"]')).toHaveClass(/selected/);
});

for (const width of [320, 360, 390, 430]) {
  test.describe(`on a ${width}px phone`, () => {
    test.use({ viewport: { width, height: 800 } });

    test('the French top bar does not overlap', async ({ page }) => {
      await page.goto('./');
      await page.evaluate(() => localStorage.setItem('ethica.languages', '{"primary":"french","parallel":null}'));
      await page.reload();
      await page.getByRole('button', { name: 'Sommaire' }).waitFor();

      const search = await page.getByRole('button', { name: 'Rechercher' }).boundingBox();
      const contents = await page.getByRole('button', { name: 'Sommaire' }).boundingBox();
      const brand = await page.locator('.brand-text').boundingBox();
      const mark = await page.locator('.brand-mark').boundingBox();

      expect(Math.max(brand!.x + brand!.width, mark!.x + mark!.width)).toBeLessThanOrEqual(search!.x);
      expect(contents!.x + contents!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    });
  });
}
