import { test, expect } from "@playwright/test"

test.describe("Tile Editor Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor/tile")
  })

  test("should display the header", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Hexmanos" })).toBeVisible()
  })

  test("should display tools card", async ({ page }) => {
    await expect(page.getByText("Tools")).toBeVisible()
    await expect(page.getByText("Current Color")).toBeVisible()
    await expect(page.getByText("Terrain Colors")).toBeVisible()
  })

  test("should display import card", async ({ page }) => {
    await expect(page.getByText("Import", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: /Import Image/i })).toBeVisible()
  })

  test("should display tile properties", async ({ page }) => {
    await expect(page.getByText("Tile Properties")).toBeVisible()
    await expect(page.getByPlaceholder("grass-plain")).toBeVisible()
    await expect(page.getByText("Passable")).toBeVisible()
  })

  test("should display tile info", async ({ page }) => {
    await expect(page.getByText("Tile Info")).toBeVisible()
    await expect(page.getByText("Size: 128x128 pixels")).toBeVisible()
    await expect(page.getByText("Format: PNG")).toBeVisible()
  })

  test("should have color picker", async ({ page }) => {
    const colorPicker = page.locator('input[type="color"]')
    await expect(colorPicker).toBeVisible()
    await expect(colorPicker).toHaveValue("#ffffff")
  })

  test("should have passable toggle", async ({ page }) => {
    const yesButton = page.getByRole("button", { name: "Yes" })
    const noButton = page.getByRole("button", { name: "No" })

    await expect(yesButton).toBeVisible()
    await expect(noButton).toBeVisible()

    // Default is passable (Yes)
    await expect(yesButton).toHaveClass(/bg-green-600/)
  })

  test("should toggle passable state", async ({ page }) => {
    const yesButton = page.getByRole("button", { name: "Yes" })
    const noButton = page.getByRole("button", { name: "No" })

    await noButton.click()
    await expect(noButton).toHaveClass(/bg-red-600/)
    await expect(page.getByText("Blocks player movement")).toBeVisible()

    await yesButton.click()
    await expect(yesButton).toHaveClass(/bg-green-600/)
    await expect(page.getByText("Players can walk through")).toBeVisible()
  })

  test("should have save button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Save Tile/i })).toBeVisible()
  })

  test("should have clear canvas button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Clear Canvas/i })).toBeVisible()
  })
})
