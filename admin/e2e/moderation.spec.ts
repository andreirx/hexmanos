import { test, expect } from "@playwright/test"

// Test credentials for admin Cognito pool
const TEST_USERNAME = "testadmin"
const TEST_PASSWORD = "AdminTest@1234"

test.describe("Asset Moderation", () => {
  // Login before each test
  test.beforeEach(async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Username").fill(TEST_USERNAME)
    await page.getByLabel("Password").fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "Sign In" }).click()
    await expect(page).toHaveURL("/assets/pending", { timeout: 15000 })
  })

  test("should display pending assets page", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Pending Review" })).toBeVisible()
  })

  test("should navigate to all assets page", async ({ page }) => {
    await page.getByRole("link", { name: "Assets" }).click()
    await expect(page).toHaveURL("/assets")
    await expect(page.getByRole("heading", { name: "All Assets" })).toBeVisible()
  })

  test("should display filter controls on all assets page", async ({ page }) => {
    await page.goto("/assets")

    // Check for filter labels
    await expect(page.getByText("Status:")).toBeVisible()
    await expect(page.getByText("Type:")).toBeVisible()
  })

  test("should show empty state or asset cards on pending page", async ({ page }) => {
    // Either there are asset cards or an empty state message
    const assetCards = page.locator('[data-testid="asset-card"]')
    const emptyState = page.getByText(/no pending assets|queue is empty|no assets/i)

    await page.waitForTimeout(1000)
    const hasAssets = await assetCards.count() > 0

    if (!hasAssets) {
      await expect(emptyState).toBeVisible()
    } else {
      await expect(assetCards.first()).toBeVisible()
    }
  })

  test("should display asset cards on all assets page", async ({ page }) => {
    await page.goto("/assets")

    // Wait for assets to load
    await page.waitForTimeout(1000)

    const assetCards = page.locator('[data-testid="asset-card"]')
    const count = await assetCards.count()

    if (count > 0) {
      // Check first asset card is visible
      const firstCard = assetCards.first()
      await expect(firstCard).toBeVisible()

      // Check for status badge
      await expect(firstCard.getByText(/PENDING|APPROVED|REJECTED|ARCHIVED/)).toBeVisible()
    }
  })

  test("should navigate between pending and assets pages", async ({ page }) => {
    // We're on pending page
    await expect(page).toHaveURL("/assets/pending")

    // Go to assets
    await page.getByRole("link", { name: "Assets" }).click()
    await expect(page).toHaveURL("/assets")

    // Go back to pending
    await page.getByRole("link", { name: "Pending Review" }).click()
    await expect(page).toHaveURL("/assets/pending")
  })
})
