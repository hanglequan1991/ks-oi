import { defineConfig } from "vitest/config";

// Credential-free unit tests. Plain Node environment, no Cloudflare plugin,
// so no CLOUDFLARE_API_TOKEN and no contact with Cloudflare.
export default defineConfig({
	esbuild: {
		jsx: "automatic",
		jsxImportSource: "hono/jsx",
	},
	oxc: {
		jsx: {
			runtime: "automatic",
			importSource: "hono/jsx",
		},
	},
	test: {
		environment: "node",
		include: [
			"test/db/**/*.spec.ts",
			"test/domain/**/*.spec.ts",
			"test/migrations/**/*.spec.ts",
			"test/fakes/**/*.spec.ts",
			"test/web/**/*.spec.{ts,tsx}",
			"test/client/**/*.spec.ts",
			"test/sync/**/*.spec.ts",
		],
	},
});
