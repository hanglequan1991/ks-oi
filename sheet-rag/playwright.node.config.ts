import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, defineConfig, devices } from "@playwright/test";

// Node-only E2E configuration: specs that use the local fake D1 and do not need a live site.
// No webServer is started (wrangler dev cannot run in the sandbox). The live-deployment TCs
// (TC-10, 23, 24, 39, 62) are ignored here; run them with playwright.config.ts instead.
// Run with: `npm run e2e:node` or `npx playwright test -c playwright.node.config.ts`.

const PW_BROWSERS = "/opt/pw-browsers";

function firstExisting(
	root: string,
	dirPrefix: string,
	relPath: string[],
	exists: (path: string) => boolean,
): string | undefined {
	let names: string[];
	try {
		names = readdirSync(root, { withFileTypes: true })
			.filter((d) => d.isDirectory() && d.name.startsWith(dirPrefix))
			.map((d) => d.name)
			.sort();
	} catch {
		return undefined;
	}
	for (const name of names) {
		const candidate = join(root, name, ...relPath);
		if (exists(candidate)) return candidate;
	}
	return undefined;
}

/**
 * Chooses the Chromium executable for the node E2E projects.
 * 1. PW_CHROMIUM_PATH when set and non-empty (used as is).
 * 2. undefined when Playwright's own default browser exists (normal install).
 * 3. The preinstalled full Chromium, then the headless shell, under `globRoot`.
 * 4. undefined (Playwright falls back to its default and fails as usual).
 */
export function resolveChromiumPath(
	env: NodeJS.ProcessEnv = process.env,
	exists: (path: string) => boolean = existsSync,
	defaultPath: () => string = () => chromium.executablePath(),
	globRoot: string = PW_BROWSERS,
): string | undefined {
	const override = env.PW_CHROMIUM_PATH;
	if (override) return override;

	if (exists(defaultPath())) return undefined;

	return (
		firstExisting(globRoot, "chromium-", ["chrome-linux64", "chrome"], exists) ??
		firstExisting(
			globRoot,
			"chromium_headless_shell-",
			["chrome-headless-shell-linux64", "chrome-headless-shell"],
			exists,
		)
	);
}

/** Launch args for the sandbox: Chromium refuses to start as root without --no-sandbox. */
export function launchArgs(isRoot: boolean): string[] {
	return isRoot ? ["--no-sandbox"] : [];
}

const isRoot = process.getuid?.() === 0;
const executablePath = resolveChromiumPath();
const launchOptions = {
	...(executablePath ? { executablePath } : {}),
	...(isRoot ? { args: launchArgs(true) } : {}),
};

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
			use: { ...devices["Desktop Chrome"], launchOptions },
		},
		{
			name: "mobile",
			use: { ...devices["Pixel 7"], launchOptions },
		},
	],
});
