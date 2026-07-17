import { expect, test } from '@playwright/test';

test.describe('guest meeting landing', () => {
  test('shows error for invalid zoom code', async ({ page }) => {
    await page.goto('/joinzoom/NOTREAL1');
    await expect(page.getByText(/invalid|expired|no longer available/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('zoom page has no NexusDesk branding', async ({ page }) => {
    await page.goto('/joinzoom/NOTREAL1');
    await expect(page.getByText('NexusDesk')).toHaveCount(0);
  });
});
