import { expect, test } from "@playwright/test";

const FULL = "/";

test.describe("simulator", () => {
  test("runs a simulation and shows metrics", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(FULL);
    await expect(page.getByRole("heading", { name: "Cache Lab" })).toBeVisible();
    await page.getByRole("combobox", { name: "Speed" }).selectOption("100");
    await page.getByRole("button", { name: /Play/ }).click();
    await expect(page.getByText(/finished/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Request trace, newest first")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("step advances the clock one event at a time", async ({ page }) => {
    await page.goto(FULL);
    await page.getByRole("button", { name: /Step/ }).click();
    await expect(page.getByLabel("Request trace, newest first")).toBeAttached();
  });

  test("replays a pasted trace", async ({ page }) => {
    await page.goto(FULL);
    await page.getByText("Replay a trace").click();
    await page.getByLabel("Paste requests").fill("GET a\nGET b\nGET a\nPUT a\nGET a");
    await page.getByRole("button", { name: "Use pasted trace" }).click();
    await expect(page.getByText(/Replaying 5 requests over 2 keys/)).toBeVisible();
    await page.getByRole("button", { name: /Step/ }).click();
  });

  test("injects a deploy and cluster actions only when relevant", async ({ page }) => {
    await page.goto("/?scenario=layers-deploy");
    await expect(page.getByRole("button", { name: "Deploy new version" })).toBeVisible();
    await page.goto("/?scenario=latency-ladder");
    await expect(page.getByRole("button", { name: "Deploy new version" })).toHaveCount(0);
  });

  test("phone width collapses panels into tabs", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(FULL);
    await expect(page.getByRole("tab", { name: "Charts" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Charts" })).toBeHidden();
    await page.getByRole("tab", { name: "Charts" }).click();
    await expect(page.getByRole("region", { name: "Charts" })).toBeVisible();
  });
});

test("config is serialized to the URL hash and restored", async ({ page }) => {
  await page.goto(FULL);
  await page.getByRole("combobox", { name: /Eviction policy/ }).selectOption("lfu");
  await page.waitForFunction(() => location.hash.startsWith("#v1."));
  const url = page.url();
  await page.goto("about:blank");
  await page.goto(url);
  await expect(page.getByRole("combobox", { name: /Eviction policy/ })).toHaveValue("lfu");
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

test("every scenario loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const id of ["latency-ladder", "strategies", "scan-resistance", "stale-reads", "layers-deploy", "stampede", "penetration", "cluster-resize", "capstone"]) {
    await page.goto(`/?scenario=${id}`);
    await page.getByRole("combobox", { name: "Speed" }).selectOption("100");
    await page.getByRole("button", { name: /Play/ }).click();
    await page.waitForTimeout(400);
  }
  expect(errors).toEqual([]);
});

test.describe("docs", () => {
  test("opens from the header, lists sections and scenarios", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Docs" }).click();
    await expect(page.getByRole("heading", { name: "Cache Lab documentation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Eviction policies" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Article 7: 5-node cluster/ })).toBeVisible();
  });

  test("?page=docs opens docs directly and the TOC scrolls to a section", async ({ page }) => {
    await page.goto("/?page=docs");
    await page.getByRole("button", { name: "Protections" }).click();
    await expect(page.getByRole("button", { name: "Protections" })).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("heading", { name: "Protections" })).toBeInViewport();
  });

  test("Open in simulator loads that scenario", async ({ page }) => {
    await page.goto("/?page=docs");
    await page.locator(".scenario-card", { hasText: "Hot key expiry spike" }).getByRole("button", { name: "Open in simulator" }).click();
    await expect(page.getByRole("combobox", { name: "Scenario" })).toHaveValue("stampede");
    await expect(page.getByRole("button", { name: /Play/ })).toBeVisible();
  });

  test("phone width keeps docs readable without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/?page=docs");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });
});
