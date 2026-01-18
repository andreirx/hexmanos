import { test, expect } from "@playwright/test"

test.describe("Map Editor Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor/map")
  })

  test("should display the header", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Hexmanos" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Sign Up" })).toBeVisible()
  })

  test("should display file operations card", async ({ page }) => {
    await expect(page.getByText("File")).toBeVisible()
    await expect(page.getByRole("button", { name: /Load Map/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /New Map/i })).toBeVisible()
  })

  test("should display tools card", async ({ page }) => {
    await expect(page.getByText("Tools")).toBeVisible()
    await expect(page.getByRole("button", { name: "Select", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Paint", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Erase", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Rect", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Disc", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Pan", exact: true })).toBeVisible()
  })

  test("should display layers card", async ({ page }) => {
    await expect(page.getByText("Layers")).toBeVisible()
    await expect(page.getByRole("button", { name: "Terrain", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Paths", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Characters", exact: true })).toBeVisible()
  })

  test("should display map size controls", async ({ page }) => {
    await expect(page.getByText("Map Size")).toBeVisible()
    await expect(page.getByText("Width")).toBeVisible()
    await expect(page.getByText("Height")).toBeVisible()
    await expect(page.getByText("16 x 16 = 256 cells")).toBeVisible()
  })

  test("should display map properties", async ({ page }) => {
    await expect(page.getByText("Map Properties")).toBeVisible()
    await expect(page.getByPlaceholder("my-dungeon")).toBeVisible()
  })

  test("should display map info", async ({ page }) => {
    await expect(page.getByText("Map Info")).toBeVisible()
    await expect(page.getByText("Size: 16 x 16")).toBeVisible()
    await expect(page.getByText("Tile size: 128px")).toBeVisible()
    await expect(page.getByText("Characters: 0")).toBeVisible()
  })

  test("should have save button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Save Map/i })).toBeVisible()
  })

  test("should display zoom controls", async ({ page }) => {
    await expect(page.getByText(/Zoom:/)).toBeVisible()
  })

  test("should display auto-transitions toggle", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Auto-Transitions/i })).toBeVisible()
  })

  test("should switch tools when clicking", async ({ page }) => {
    // Default is Paint
    await expect(page.getByRole("button", { name: "Paint", exact: true })).toHaveClass(/bg-blue-600/)

    // Click Select
    await page.getByRole("button", { name: "Select", exact: true }).click()
    await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveClass(/bg-blue-600/)
    await expect(page.getByRole("button", { name: "Paint", exact: true })).not.toHaveClass(/bg-blue-600/)

    // Click Erase
    await page.getByRole("button", { name: "Erase", exact: true }).click()
    await expect(page.getByRole("button", { name: "Erase", exact: true })).toHaveClass(/bg-blue-600/)
    await expect(page.getByRole("button", { name: "Select", exact: true })).not.toHaveClass(/bg-blue-600/)

    // Click Pan
    await page.getByRole("button", { name: "Pan", exact: true }).click()
    await expect(page.getByRole("button", { name: "Pan", exact: true })).toHaveClass(/bg-blue-600/)
    await expect(page.getByRole("button", { name: "Erase", exact: true })).not.toHaveClass(/bg-blue-600/)
  })

  test("should switch layers when clicking", async ({ page }) => {
    // Default is Terrain
    await expect(page.getByRole("button", { name: "Terrain", exact: true })).toHaveClass(/bg-green-600/)

    // Click Paths
    await page.getByRole("button", { name: "Paths", exact: true }).click()
    await expect(page.getByRole("button", { name: "Paths", exact: true })).toHaveClass(/bg-amber-600/)
    await expect(page.getByRole("button", { name: "Terrain", exact: true })).not.toHaveClass(/bg-green-600/)

    // Click Characters
    await page.getByRole("button", { name: "Characters", exact: true }).click()
    await expect(page.getByRole("button", { name: "Characters", exact: true })).toHaveClass(/bg-purple-600/)
    await expect(page.getByRole("button", { name: "Paths", exact: true })).not.toHaveClass(/bg-amber-600/)
  })

  test("should open map gallery when Load Map clicked", async ({ page }) => {
    await page.getByRole("button", { name: /Load Map/i }).click()
    await expect(page.getByText("Map Gallery")).toBeVisible()
  })

  test("should close map gallery when clicking backdrop", async ({ page }) => {
    await page.getByRole("button", { name: /Load Map/i }).click()
    await expect(page.getByText("Map Gallery")).toBeVisible()

    // Click the X button to close
    await page.locator(".relative.bg-zinc-800 button").first().click()
    await expect(page.getByText("Map Gallery")).not.toBeVisible()
  })

  test("should reset map when New Map clicked", async ({ page }) => {
    // Change the map name first
    const nameInput = page.getByPlaceholder("my-dungeon")
    await nameInput.fill("test-map")
    await expect(nameInput).toHaveValue("test-map")

    // Click New Map
    await page.getByRole("button", { name: /New Map/i }).click()

    // Name should be cleared
    await expect(nameInput).toHaveValue("")
  })

  test("should show terrain palette when terrain layer selected", async ({ page }) => {
    // Terrain is default layer
    await expect(page.getByText("Terrain Types")).toBeVisible()
  })

  test("should show path palette when paths layer selected", async ({ page }) => {
    await page.getByRole("button", { name: "Paths", exact: true }).click()
    await expect(page.getByText("Path Types")).toBeVisible()
  })

  test("should show character palette when characters layer selected", async ({ page }) => {
    await page.getByRole("button", { name: "Characters", exact: true }).click()
    // The palette title is just "Characters" but there's also a button, so check for the palette card
    await expect(page.getByText("Select a character and click")).toBeVisible()
  })

  test("should show layer-specific hints", async ({ page }) => {
    // Terrain hint
    await expect(page.getByText(/Select a tile type and paint/)).toBeVisible()

    // Path hint
    await page.getByRole("button", { name: "Paths", exact: true }).click()
    await expect(page.getByText(/Select a path type and paint/)).toBeVisible()

    // Character hint
    await page.getByRole("button", { name: "Characters", exact: true }).click()
    await expect(page.getByText(/Select a character and click/)).toBeVisible()
  })

  test("should have a canvas element", async ({ page }) => {
    const canvas = page.locator("canvas")
    await expect(canvas).toBeVisible()
  })

  test("should change map size when width/height inputs changed", async ({ page }) => {
    const widthInput = page.locator('input[type="number"]').first()
    const heightInput = page.locator('input[type="number"]').nth(1)

    // Change width to 20
    await widthInput.fill("20")
    await expect(page.getByText("20 x 16 = 320 cells")).toBeVisible()

    // Change height to 24
    await heightInput.fill("24")
    await expect(page.getByText("20 x 24 = 480 cells")).toBeVisible()
    await expect(page.getByText("Size: 20 x 24")).toBeVisible()
  })
})
