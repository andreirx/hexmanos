import { test, expect } from "@playwright/test"

test.describe("Tile Editor Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor/tile")
  })

  test("should display the tile editor layout", async ({ page }) => {
    // Check left sidebar tools
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible()
    await expect(page.getByText("Current Color")).toBeVisible()
    await expect(page.getByText("Terrain Colors")).toBeVisible()

    // Check import section
    await expect(page.getByRole("heading", { name: "Import" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Import Image/i })).toBeVisible()

    // Check right sidebar tile properties
    await expect(page.getByRole("heading", { name: "Tile Properties" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Tile Info" })).toBeVisible()

    // Check tile info
    await expect(page.getByText("Size: 32x32 pixels")).toBeVisible()
  })

  test("should have passable toggle buttons", async ({ page }) => {
    await expect(page.getByText("Passable")).toBeVisible()

    const yesButton = page.getByRole("button", { name: "Yes" })
    const noButton = page.getByRole("button", { name: "No" })

    await expect(yesButton).toBeVisible()
    await expect(noButton).toBeVisible()

    // Default should be passable (yes)
    await expect(page.getByText("Players can walk through")).toBeVisible()

    // Click no
    await noButton.click()
    await expect(page.getByText("Blocks player movement")).toBeVisible()
  })

  test("should have tile name input", async ({ page }) => {
    const nameInput = page.getByPlaceholder("grass-plain")
    await expect(nameInput).toBeVisible()
    await expect(nameInput).toHaveValue("")
  })

  test("should have save button disabled without name", async ({ page }) => {
    const saveButton = page.getByRole("button", { name: /Save Tile/i })
    await expect(saveButton).toBeVisible()
    await expect(saveButton).toBeDisabled()
  })

  test("should enable save button when name is entered", async ({ page }) => {
    const nameInput = page.getByPlaceholder("grass-plain")
    const saveButton = page.getByRole("button", { name: /Save Tile/i })

    await nameInput.fill("test-tile")
    await expect(saveButton).toBeEnabled()
  })

  test("should update collision info based on passable state", async ({ page }) => {
    await expect(page.getByText("Collision: None")).toBeVisible()

    const noButton = page.getByRole("button", { name: "No" })
    await noButton.click()

    await expect(page.getByText("Collision: Solid")).toBeVisible()
  })

  test("should have clear canvas button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Clear Canvas/i })).toBeVisible()
  })
})
