import { test, expect } from "@playwright/test"

test.describe("Home Page", () => {
  test("should display the home page with title", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByRole("heading", { name: "Hexmanos Engine" })).toBeVisible()
    await expect(page.getByText("Pixel Art Game Engine")).toBeVisible()
  })

  test("should have link to editor", async ({ page }) => {
    await page.goto("/")

    const editorLink = page.getByRole("link", { name: "Open Editor" })
    await expect(editorLink).toBeVisible()
    await expect(editorLink).toHaveAttribute("href", "/editor")
  })

  test("should navigate to editor when clicking link", async ({ page }) => {
    await page.goto("/")

    await page.getByRole("link", { name: "Open Editor" }).click()

    await expect(page).toHaveURL("/editor")
  })
})
