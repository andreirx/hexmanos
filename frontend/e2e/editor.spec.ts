import { test, expect } from "@playwright/test"

test.describe("Editor Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor")
  })

  test("should display the editor layout", async ({ page }) => {
    // Check left sidebar tools
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible()
    await expect(page.getByText("Current Color")).toBeVisible()
    await expect(page.getByText("Presets")).toBeVisible()

    // Check import section
    await expect(page.getByRole("heading", { name: "Import" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Import Image/i })).toBeVisible()

    // Check right sidebar metadata
    await expect(page.getByRole("heading", { name: "Asset Metadata" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Canvas Info" })).toBeVisible()

    // Check canvas info
    await expect(page.getByText("Size: 32x32 pixels")).toBeVisible()
  })

  test("should have color picker", async ({ page }) => {
    const colorPicker = page.locator('input[type="color"]')
    await expect(colorPicker).toBeVisible()
    await expect(colorPicker).toHaveValue("#ffffff")
  })

  test("should have asset name input", async ({ page }) => {
    const nameInput = page.getByPlaceholder("my-character")
    await expect(nameInput).toBeVisible()
    await expect(nameInput).toHaveValue("")
  })

  test("should have asset type selector", async ({ page }) => {
    const typeSelect = page.getByRole("combobox")
    await expect(typeSelect).toBeVisible()
    await expect(typeSelect).toHaveValue("CHARACTER")

    // Check all options are available
    await typeSelect.selectOption("TILE")
    await expect(typeSelect).toHaveValue("TILE")

    await typeSelect.selectOption("MAP")
    await expect(typeSelect).toHaveValue("MAP")
  })

  test("should have clear canvas button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Clear Canvas/i })).toBeVisible()
  })

  test("should have save button disabled without name", async ({ page }) => {
    const saveButton = page.getByRole("button", { name: /Save Asset/i })
    await expect(saveButton).toBeVisible()
    await expect(saveButton).toBeDisabled()
  })

  test("should enable save button when name is entered", async ({ page }) => {
    const nameInput = page.getByPlaceholder("my-character")
    const saveButton = page.getByRole("button", { name: /Save Asset/i })

    await nameInput.fill("test-asset")
    await expect(saveButton).toBeEnabled()
  })

  test("should display canvas with instructions", async ({ page }) => {
    await expect(page.getByText(/Scroll to zoom/i)).toBeVisible()
    await expect(page.getByText(/Alt\+drag to pan/i)).toBeVisible()
    await expect(page.getByText(/Click to draw/i)).toBeVisible()
  })

  test("should update status to ready when name entered", async ({ page }) => {
    await expect(page.getByText("Status: Enter a name")).toBeVisible()

    await page.getByPlaceholder("my-character").fill("test-asset")

    await expect(page.getByText("Status: Ready to save")).toBeVisible()
  })

  test("should have color preset buttons", async ({ page }) => {
    // Check that preset buttons exist (we expect 16 presets)
    const presetButtons = page.locator("button").filter({ has: page.locator('[style*="background-color"]') })
    await expect(presetButtons.first()).toBeVisible()
  })

  test("should change current color when clicking preset", async ({ page }) => {
    const colorPicker = page.locator('input[type="color"]')
    const initialColor = await colorPicker.inputValue()

    // Click on a different color preset (black)
    const blackPreset = page.locator('button[title="#000000"]')
    await blackPreset.click()

    await expect(colorPicker).toHaveValue("#000000")
    expect(await colorPicker.inputValue()).not.toBe(initialColor)
  })
})
