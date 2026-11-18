import { defineConfig, devices } from "@playwright/test";

// E2E configuration. Browsers are not downloaded here: run `npx playwright install chromium`
// on the owner's or CI machine. Set E2E_BASE_URL to test a running site instead of starting
// the local Worker (the web server is then skipped).
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:8787";

export default defineConfig({
	testDir: "./e2e",
	testMatch: /.*\.e2e\.ts$/,
	fullyParallel: true,
	retries: 0,
	reporter: "list",
	use: {
		baseURL,
	},
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
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: "npm run build:client && npx wrangler dev --local --port 8787",
				url: baseURL,
				reuseExistingServer: true,
				timeout: 120_000,
			},
});
