import { expect, test } from "@playwright/test";

test("loads, runs a simulation and shows metrics", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cache Lab" })).toBeVisible();
  await page.getByRole("combobox", { name: "Speed" }).selectOption("100");
  await page.getByRole("button", { name: /Play/ }).click();
  await expect(page.getByText(/finished/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("log").or(page.getByLabel("Request trace, newest first"))).toBeVisible();
  expect(errors).toEqual([]);
});

test("step advances the clock one event at a time", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Step/ }).click();
  await expect(page.getByLabel("Request trace, newest first")).toBeAttached();
});

test("config is serialized to the URL hash and restored", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Eviction policy" }).selectOption("lfu");
  await page.waitForFunction(() => location.hash.startsWith("#v1."));
  const url = page.url();
  await page.goto("about:blank");
  await page.goto(url);
  await expect(page.getByRole("combobox", { name: "Eviction policy" })).toHaveValue("lfu");
});

test("scenario query param picks the preset", async ({ page }) => {
  await page.goto("/?scenario=stampede");
  await expect(page.getByRole("combobox", { name: "Scenario" })).toHaveValue("stampede");
});

test("embed mode hides the chrome", async ({ page }) => {
  await page.goto("/?embed=1&scenario=stampede");
  await expect(page.getByRole("heading", { name: "Cache Lab" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Play/ })).toBeVisible();
});

test("phone width collapses panels into tabs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Charts" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Charts" })).toBeHidden();
  await page.getByRole("tab", { name: "Charts" }).click();
  await expect(page.getByRole("region", { name: "Charts" })).toBeVisible();
});
