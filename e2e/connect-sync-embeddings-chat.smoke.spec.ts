import { expect, test } from '@playwright/test';

import { installApiRouteMocks, installSupabaseClientMock, type ApiCallTracker } from './support/installMocks';

test.describe('Connect to Chat smoke flow', () => {
  test('runs connect -> sync -> embeddings -> chat in-browser', async ({ page }) => {
    const tracker: ApiCallTracker = {
      syncGithubCalls: 0,
      syncEmbeddingsCalls: 0,
      chatCalls: 0,
    };

    await installSupabaseClientMock(page);
    await installApiRouteMocks(page, tracker);

    // Visit connector page with oauth success param to trigger sync UI state
    await page.goto('/connect/github?oauth=success');

    // Verify success indicator is shown on the oauth redirect page
    await expect(page.getByText('github connected. Syncing...')).toBeVisible();

    // Wait for auto redirect to the readiness view
    await page.waitForURL(url => url.searchParams.get('view') === 'readiness', { timeout: 5000 });

    // Verify the page heading and platform card are visible
    await expect(page.getByRole('heading', { name: 'Network Integrity' })).toBeVisible();
    await expect(page.locator('strong').filter({ hasText: 'GitHub' })).toBeVisible();

    // Verify and click the force sync button on the platform card
    const forceSyncButton = page.getByRole('button', { name: 'Force Sync' }).first();
    await expect(forceSyncButton).toBeVisible();
    await forceSyncButton.click();

    // Assert that the sync API call is intercepted
    await expect.poll(() => tracker.syncGithubCalls).toBeGreaterThan(0);

    // Call embeddings sync manually via fetch
    const embeddingsSyncOk = await page.evaluate(async () => {
      const response = await fetch('/api/sync/embeddings', { method: 'POST' });
      return response.ok;
    });

    expect(embeddingsSyncOk).toBe(true);
    await expect.poll(() => tracker.syncEmbeddingsCalls).toBeGreaterThan(0);

    // Go to main dashboard/chat view
    await page.goto('/');

    // Wait for the neural linkage loading overlay to complete
    await expect(page.getByText('INITIALIZING EYES NEURAL LINK...')).toBeHidden({ timeout: 5000 });

    // Now type into the chat input
    const chatInput = page.getByPlaceholder('Search digital memories...');
    await expect(chatInput).toBeVisible();

    await chatInput.fill('What changed in my GitHub activity this week?');
    await chatInput.press('Enter');

    await expect.poll(() => tracker.chatCalls).toBeGreaterThan(0);

    await expect(page.getByText(/retry resiliency work/i)).toBeVisible();
  });
});
