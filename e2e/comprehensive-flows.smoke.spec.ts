import { expect, test } from '@playwright/test';

import { installApiRouteMocks, installSupabaseClientMock, type ApiCallTracker } from './support/installMocks';

test.describe('EYES Cognitive OS Comprehensive Flow', () => {
  test('successfully navigates through Chat, Connectors, Audit, and History sections', async ({ page }) => {
    const tracker: ApiCallTracker = {
      syncGithubCalls: 0,
      syncEmbeddingsCalls: 0,
      chatCalls: 0,
    };

    // Install mocks
    await installSupabaseClientMock(page);
    await installApiRouteMocks(page, tracker);

    // 1. Initial Page Load (Chat View)
    await page.goto('/');
    await expect(page.getByText('INITIALIZING EYES NEURAL LINK...')).toBeHidden({ timeout: 10000 });

    // Chat functionality check
    const chatInput = page.getByPlaceholder('Search digital memories...');
    await expect(chatInput).toBeVisible();
    await chatInput.fill('What changed in my GitHub activity this week?');
    await chatInput.press('Enter');
    await expect.poll(() => tracker.chatCalls).toBeGreaterThan(0);
    await expect(page.getByText(/retry resiliency work/i)).toBeVisible();

    // 2. Connectors View Check
    const connectorsSidebar = page.getByRole('button', { name: /Connectors/i }).or(page.getByText(/Connectors/i));
    await connectorsSidebar.first().click();
    await expect(page.getByRole('heading', { name: 'Neural Archive' })).toBeVisible();
    await expect(page.locator('strong').filter({ hasText: 'Notion' })).toBeVisible();

    // 3. Audit Control Center Flow
    await page.goto('/?view=audit');
    await expect(page.getByRole('heading', { name: 'Audit Control Center' })).toBeVisible();

    // Directly view the latest completed certificate to bypass 25s animation delay
    const viewLatestBtn = page.getByRole('button', { name: /VIEW LATEST CERTIFICATE/i });
    await expect(viewLatestBtn).toBeVisible();
    await viewLatestBtn.click();

    // Verify Audit Certificate View
    await expect(page.getByRole('heading', { name: 'Audit Certificate' })).toBeVisible();
    await expect(page.getByText('Brand new audit executed perfectly.')).toBeVisible();
    await expect(page.getByText('SECURE REPORT ACCESS REQUIRED')).toBeVisible();

    // 4. Neural History View Flow
    const historySidebar = page.getByRole('button', { name: /History/i }).or(page.getByText(/History/i));
    await historySidebar.first().click();
    await expect(page.getByRole('heading', { name: 'Neural History' })).toBeVisible();

    // Verify mock conversations thread is loaded
    await expect(page.getByText('Mocked PR discussion thread')).toBeVisible();

    // Check Audit Certificates Tab
    await page.getByRole('button', { name: 'Audit Certificates' }).click();
    await expect(page.getByText('Certificate AUDIT-LA')).toBeVisible();

    // Check Neural Activity Tab
    await page.getByRole('button', { name: 'Neural Activity' }).click();
    await expect(page.getByText('Neural Link Update')).toBeVisible();
  });
});
