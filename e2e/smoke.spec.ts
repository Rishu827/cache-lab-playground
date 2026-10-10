import { expect, test } from "@playwright/test";

const FULL = "/?view=full";

test.describe("simple view (default)", () => {
  test("shows the goal, plain-English narration and only the focused controls", async ({ page }) => {
    await page.goto("/?scenario=scan-resistance");
    await expect(page.getByText(/Keep the hit ratio above 45%/)).toBeVisible();
    await expect(page.getByText("Press Play to start sending requests.")).toBeVisible();
    await expect(page.getByRole("combobox", { name: /Eviction policy/ })).toBeVisible();
    // Controls that don't matter for this scenario are hidden.
    await expect(page.getByLabel(/Failure rate/)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Charts" })).toHaveCount(0);
  });

  test("runs to the end and reports a result", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?scenario=latency-ladder");
    await page.getByRole("button", { name: "100×" }).click();
    await page.getByRole("button", { name: /Play/ }).click();
    await expect(page.getByText(/finished/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/were answered by the cache/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("switching the chart metric works and Show all controls opens the full view", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Latency" }).click();
    await expect(page.getByRole("button", { name: "Latency" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /Show all controls/ }).click();
    await expect(page.getByRole("region", { name: "Controls" })).toBeVisible();
  });

  test("cluster scenario spotlights router controls", async ({ page }) => {
    await page.goto("/?scenario=cluster-resize");
    await expect(page.getByRole("combobox", { name: /Router/ })).toBeVisible();
    await page.getByRole("combobox", { name: /Router/ }).selectOption("consistent");
    await expect(page.getByLabel(/Virtual nodes/)).toBeVisible();
  });

  test("layers scenario draws browser and CDN in the topology", async ({ page }) => {
    await page.goto("/?scenario=layers-deploy");
    await expect(page.getByRole("img", { name: /Client to Browser to CDN to Cache to Origin/ })).toBeVisible();
  });
});

test.describe("full view", () => {
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
    await page.goto("/?scenario=layers-deploy&view=full");
    await expect(page.getByRole("button", { name: "Deploy new version" })).toBeVisible();
    await page.goto("/?scenario=latency-ladder&view=full");
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
  await page.goto("/?scenario=stampede&view=full");
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
    await page.getByRole("button", { name: "100×" }).click();
    await page.getByRole("button", { name: /Play/ }).click();
    await page.waitForTimeout(400);
  }
  expect(errors).toEqual([]);
});
