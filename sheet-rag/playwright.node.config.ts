import { defineConfig, devices } from "@playwright/test";

// Node-only E2E configuration: specs that use the local fake D1 and do not need a live site.
// No webServer is started (wrangler dev cannot run in the sandbox). The live-deployment TCs
// (TC-10, 23, 24, 39, 62) are ignored here; run them with playwright.config.ts instead.
// Run with: `npm run e2e:node` or `npx playwright test -c playwright.node.config.ts`.

export default defineConfig({
	testDir: "./e2e",
	testMatch: /.*\.e2e\.ts$/,
	testIgnore: /TC-(10|23|24|39|62)\.e2e\.ts$/,
	fullyParallel: true,
	retries: 0,
	reporter: "list",
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "mobile",
			use: { ...devices["Pixel 7"] },
		},
	],
});
