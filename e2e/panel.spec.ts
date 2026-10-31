import { expect, test } from '@playwright/test';

test('labels name the part, including Part II references read from later parts', async ({ page }) => {
  await page.goto('./#III.prop.6');

  const own = page.locator('.relationship-chip[data-target-id="III.prop.4"]').first();
  await expect(own).toHaveText('III, Prop. IV');
  await expect(page.locator('.relationship-chip[data-target-id="I.prop.34"]').first()).toHaveText('I, Prop. XXXIV');

  await page.goto('./#III.prop.1.proof');
  await expect(page.locator('.relationship-chip[data-target-id^="II."]').first()).toContainText(/^II, /);
});

test('long lists stay collapsed until asked', async ({ page }) => {
  await page.goto('./#III.prop.11.note');

  await expect(page.locator('.panel-section').first()).toBeVisible();
  const usedBy = page.locator('.relationship-group', { hasText: 'Used by' });
  await expect(usedBy.locator('.relationship-chip')).toHaveCount(12);

  await usedBy.locator('.show-more').click();
  expect(await usedBy.locator('.relationship-chip').count()).toBeGreaterThan(12);
});

test('a dependency path can be followed step by step', async ({ page }) => {
  await page.goto('./#III.prop.6');

  await page.locator('.path-details summary').first().click();
  const firstRow = page.locator('.path-row').first();
  const step = firstRow.locator('.path-step').first();
  const target = await step.getAttribute('data-target-id');

  await step.click();

  await expect(page.locator('.panel-id')).toHaveText(target!);
});

test('every link on sampled passages from each part lands on a passage', async ({ page }) => {
  for (const id of ['I.prop.11', 'II.prop.7.note', 'III.prop.27', 'IV.prop.37', 'V.prop.42.proof']) {
    await page.goto(`./#${id}`);
    await page.reload();
    await expect(page.locator('.panel-id')).toHaveText(id);
    await expect(page.locator('.panel-section').first()).toBeVisible();

    const targets = await page.locator('.relationship-chip').evaluateAll(chips => chips.slice(0, 6).map(chip => chip.getAttribute('data-target-id')!));
    expect(targets.length).toBeGreaterThan(0);

    for (const target of targets) {
      await page.locator(`.relationship-chip[data-target-id="${target}"]`).first().click();
      await expect(page.locator('.panel-id')).toHaveText(target);
      await expect(page.locator(`[data-element-id="${target}"]`)).toHaveClass(/selected/);
      await page.goBack();
      await expect(page.locator('.panel-id')).toHaveText(id);
    }
  }
});

test('the panel follows the reading mode and hides footnote markers', async ({ page }) => {
  await page.goto('./#III.prop.29');
  await expect(page.locator('.selected-text')).toContainText('conceive men to regard');
  await expect(page.locator('.selected-text')).not.toContainText('[6]');

  await page.locator('.sidebar-reading-mode').getByRole('button', { name: 'Latin' }).click();
  await expect(page.locator('.selected-text [lang="la"]')).toBeVisible();
  await expect(page.locator('.selected-text')).not.toContainText('conceive men');

  await page.locator('.sidebar-reading-mode').getByRole('button', { name: 'Bilingual' }).click();
  await expect(page.locator('.selected-text [lang="en"]')).toBeVisible();
  await expect(page.locator('.selected-text [lang="la"]')).toBeVisible();
});

test('the sidebar names the selection generically', async ({ page }) => {
  await page.goto('./#I.prop.1.proof');
  await expect(page.locator('.selection-card')).toContainText('Selected passage');
  await expect(page.locator('.selection-card')).toContainText('Proof');
});

test('highlighting text does not toggle the passage', async ({ page }) => {
  await page.goto('./');
  const passage = page.locator('[data-element-id="I.def.3"]');
  const body = passage.locator('.entry-body p').first();
  await body.scrollIntoViewIfNeeded();
  await body.selectText();

  await body.click({ position: { x: 20, y: 5 }, noWaitAfter: true }).catch(() => undefined);
  // A real drag finishes with a selection still present; simulate that with a synthetic click.
  await body.selectText();
  await body.evaluate(element => element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));

  await expect(page.locator('.selected')).toHaveCount(0);
});

test('the whole reader works with the keyboard alone', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('[data-element-id="I.def.1"]')).toBeVisible();

  // Tab from the top of the page until a passage takes focus.
  let focused = '';
  for (let presses = 0; presses < 40 && focused !== 'entry-select'; presses += 1) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.className ?? '');
  }
  expect(focused).toBe('entry-select');

  const selectedId = await page.evaluate(() => document.activeElement?.closest('[data-element-id]')?.getAttribute('data-element-id'));

  // The first passage opens the panel and takes the reader there.
  await page.keyboard.press('Enter');
  await expect(page.locator('.panel-id')).toHaveText(selectedId!);
  await expect(page.locator('.panel-card.pinned')).toBeFocused();
  await expect(page.locator('.relationship-chip').first()).toBeVisible();

  // Tab within the panel to a relationship and follow it.
  let onChip = false;
  for (let presses = 0; presses < 30 && !onChip; presses += 1) {
    await page.keyboard.press('Tab');
    onChip = await page.evaluate(() => document.activeElement?.classList.contains('relationship-chip') ?? false);
  }
  expect(onChip).toBe(true);

  const target = await page.evaluate(() => document.activeElement?.getAttribute('data-target-id'));
  await page.keyboard.press('Enter');
  await expect(page.locator('.panel-id')).toHaveText(target!);
  await expect(page.locator('.panel-card.pinned')).toBeFocused();

  // Escape closes the panel and returns to the passage.
  await page.keyboard.press('Escape');
  await expect(page.locator('.reasoning-panel.empty')).toBeVisible();
  await expect(page.locator(`[data-element-id="${target}"] > .entry-header .entry-select`)).toBeFocused();
});

test('passages have a visible focus indicator', async ({ page }) => {
  await page.goto('./');
  const button = page.locator('[data-element-id="I.def.1"] .entry-select').first();
  await button.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const outline = await button.evaluate(element => getComputedStyle(element).outlineStyle);
  expect(outline).toBe('solid');
});
