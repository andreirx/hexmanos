import { test, expect } from "@playwright/test"

test.describe("Home Page", () => {
  test("should display the home page with title", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByRole("heading", { name: "Hexmanos Engine" })).toBeVisible()
    await expect(page.getByText("Pixel Art Game Engine")).toBeVisible()
  })

  test("should display the header", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByRole("link", { name: "Hexmanos" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Sign Up" })).toBeVisible()
  })

  test("should have link to character editor", async ({ page }) => {
    await page.goto("/")

    const editorLink = page.getByRole("link", { name: "Character Editor" })
    await expect(editorLink).toBeVisible()
    await expect(editorLink).toHaveAttribute("href", "/editor/character")
  })

  test("should have link to tile editor", async ({ page }) => {
    await page.goto("/")

    const tileLink = page.getByRole("link", { name: "Tile Editor" })
    await expect(tileLink).toBeVisible()
    await expect(tileLink).toHaveAttribute("href", "/editor/tile")
  })

  test("should have link to map editor", async ({ page }) => {
    await page.goto("/")

    const mapLink = page.getByRole("link", { name: "Map Editor" })
    await expect(mapLink).toBeVisible()
    await expect(mapLink).toHaveAttribute("href", "/editor/map")
  })

  test("should navigate to map editor when clicking link", async ({ page }) => {
    await page.goto("/")

    await page.getByRole("link", { name: "Map Editor" }).click()

    await expect(page).toHaveURL("/editor/map")
  })

  test("should navigate to character editor when clicking link", async ({ page }) => {
    await page.goto("/")

    await page.getByRole("link", { name: "Character Editor" }).click()

    await expect(page).toHaveURL("/editor/character")
  })
})
