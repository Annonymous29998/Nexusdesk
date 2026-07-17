import { expect, test } from '@playwright/test';

test.describe('dashboard auth shell', () => {
  test('renders the sign-in experience', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('.tui-box-title', { hasText: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('does not offer public registration', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: /create an account/i })).toHaveCount(0);
    await page.goto('/register');
    await expect(page).toHaveURL(/\/login/);
  });
});
