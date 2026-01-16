import { test, expect } from "@playwright/test"

test.describe("Character Editor Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor/character")
  })

  test("should display the header", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Hexmanos" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Sign Up" })).toBeVisible()
  })

  test("should display file operations card", async ({ page }) => {
    await expect(page.getByText("File")).toBeVisible()
    await expect(page.getByRole("button", { name: /Load Character/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /New Character/i })).toBeVisible()
  })

  test("should display animation state selector", async ({ page }) => {
    await expect(page.getByText("Animation State")).toBeVisible()
    await expect(page.getByRole("button", { name: "Idle" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Walk Down" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Walk Up" })).toBeVisible()
  })

  test("should display color picker", async ({ page }) => {
    await expect(page.getByText("Color")).toBeVisible()
    const colorPicker = page.locator('input[type="color"]')
    await expect(colorPicker).toBeVisible()
    await expect(colorPicker).toHaveValue("#ffffff")
  })

  test("should display character name input", async ({ page }) => {
    await expect(page.getByText("Character").first()).toBeVisible()
    const nameInput = page.getByPlaceholder("blue-knight")
    await expect(nameInput).toBeVisible()
  })

  test("should display info card", async ({ page }) => {
    await expect(page.getByText("Info")).toBeVisible()
    await expect(page.getByText("Sprite: 32x32px")).toBeVisible()
    await expect(page.getByText("States: 7")).toBeVisible()
  })

  test("should display save button", async ({ page }) => {
    const saveButton = page.getByRole("button", { name: /Save Character/i })
    await expect(saveButton).toBeVisible()
  })

  test("should open character gallery when Load Character clicked", async ({ page }) => {
    await page.getByRole("button", { name: /Load Character/i }).click()
    await expect(page.getByText("Character Gallery")).toBeVisible()
  })

  test("should close gallery when clicking X button", async ({ page }) => {
    await page.getByRole("button", { name: /Load Character/i }).click()
    await expect(page.getByText("Character Gallery")).toBeVisible()

    // Click the X button to close (inside the dialog header)
    await page.locator(".relative.bg-zinc-800 button").first().click()
    await expect(page.getByText("Character Gallery")).not.toBeVisible()
  })

  test("should switch animation states", async ({ page }) => {
    // Default is Idle
    await expect(page.getByRole("button", { name: "Idle" })).toHaveClass(/bg-blue-600/)

    // Click Walk Down
    await page.getByRole("button", { name: "Walk Down" }).click()
    await expect(page.getByRole("button", { name: "Walk Down" })).toHaveClass(/bg-blue-600/)
    await expect(page.getByRole("button", { name: "Idle" })).not.toHaveClass(/bg-blue-600/)
  })
})
