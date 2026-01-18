import { test, expect } from "@playwright/test"

// Test credentials for admin Cognito pool
const TEST_USERNAME = "testadmin"
const TEST_PASSWORD = "AdminTest@1234"

test.describe("Admin Login", () => {
  test("should display login page", async ({ page }) => {
    await page.goto("/login")

    await expect(page.getByRole("heading", { name: "Admin Login" })).toBeVisible()
    await expect(page.getByLabel("Username")).toBeVisible()
    await expect(page.getByLabel("Password")).toBeVisible()
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible()
  })

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/login")

    await page.getByLabel("Username").fill("wronguser")
    await page.getByLabel("Password").fill("wrongpassword")
    await page.getByRole("button", { name: "Sign In" }).click()

    // Should show error message
    await expect(page.getByText(/incorrect|invalid|error|failed/i)).toBeVisible({ timeout: 10000 })
  })

  test("should redirect to pending assets after successful login", async ({ page }) => {
    await page.goto("/login")

    await page.getByLabel("Username").fill(TEST_USERNAME)
    await page.getByLabel("Password").fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "Sign In" }).click()

    // Should redirect to pending assets page
    await expect(page).toHaveURL("/assets/pending", { timeout: 15000 })

    // Should show the header with username
    await expect(page.getByText(TEST_USERNAME)).toBeVisible()
  })

  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/assets")

    // Should redirect to login
    await expect(page).toHaveURL("/login")
  })

  test("should redirect root to pending assets when authenticated", async ({ page }) => {
    // Login first
    await page.goto("/login")
    await page.getByLabel("Username").fill(TEST_USERNAME)
    await page.getByLabel("Password").fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "Sign In" }).click()
    await expect(page).toHaveURL("/assets/pending", { timeout: 15000 })

    // Now visit root
    await page.goto("/")
    await expect(page).toHaveURL("/assets/pending")
  })

  test("should logout successfully", async ({ page }) => {
    // Login first
    await page.goto("/login")
    await page.getByLabel("Username").fill(TEST_USERNAME)
    await page.getByLabel("Password").fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "Sign In" }).click()
    await expect(page).toHaveURL("/assets/pending", { timeout: 15000 })

    // Logout
    await page.getByRole("button", { name: "Logout" }).click()

    // Should redirect to login
    await expect(page).toHaveURL("/login")
  })
})
