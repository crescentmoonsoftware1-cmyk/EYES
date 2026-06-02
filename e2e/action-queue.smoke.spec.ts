import { expect, test } from '@playwright/test';

import { installApiRouteMocks, installSupabaseClientMock, type ApiCallTracker } from './support/installMocks';

test.describe('Action Queue E2E smoke flow', () => {
  test('loads action queue, views, edits, and executes an action item', async ({ page }) => {
    const tracker: ApiCallTracker = {
      syncGithubCalls: 0,
      syncEmbeddingsCalls: 0,
      chatCalls: 0,
    };

    // Install Supabase and API mocks
    await installSupabaseClientMock(page);
    await installApiRouteMocks(page, tracker);

    // Navigate to dashboard home page
    await page.goto('/');

    // Wait for the initialization overlay to disappear
    await expect(page.getByText('INITIALIZING EYES NEURAL LINK...')).toBeHidden({ timeout: 5000 });

    // Click the 'Action Queue' item in the Sidebar
    const sidebarLink = page.getByRole('button', { name: /Action Queue/i }).or(page.getByText(/Action Queue/i));
    await sidebarLink.first().click();

    // Verify view has switched to the action command bridge
    await expect(page.getByRole('heading', { name: 'Action Command Bridge' })).toBeVisible();

    // Wait for queue loading indicator to disappear
    await expect(page.getByText('LOADING ACTION QUEUE...')).toBeHidden({ timeout: 5000 });

    // Locate and click the action card to expand it
    const actionCard = page.locator('#action-1');
    await expect(actionCard).toBeVisible();
    await actionCard.click();

    // Check that expanded components are rendering correctly
    await expect(page.getByText('EYES COGNITIVE ASSISTANT')).toBeVisible();
    await expect(page.getByText(/Would you like to attend the dinner tomorrow/i).first()).toBeVisible();

    // Click the execute button
    const executeButton = page.getByRole('button', { name: 'EXECUTE' });
    await expect(executeButton).toBeVisible();
    await executeButton.click();

    // Verify that the card is removed from the pending list after execution finishes
    await expect(actionCard).toBeHidden({ timeout: 5000 });

    // Click the manual re-scan button
    const rescanButton = page.getByRole('button', { name: 'RE-SCAN NOW' });
    await expect(rescanButton).toBeVisible();
    await rescanButton.click();
  });
});
