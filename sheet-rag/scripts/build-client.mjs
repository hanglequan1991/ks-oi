// Bundles the browser entry (src/client/bill/main.ts) into public/bill.js.
// Build output only: no network, no Cloudflare credentials needed.
import { build } from "esbuild";
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export async function buildClient(o = {}) {
	const {
		entry = "src/client/bill/main.ts",
		outfile = "public/bill.js",
		minify = true,
		cwd = process.cwd(),
	} = o;
	const base = resolve(cwd);
	const out = resolve(base, outfile);
	await build({
		absWorkingDir: base,
		entryPoints: [resolve(base, entry)],
		outfile: out,
		bundle: true,
		format: "iife",
		target: "es2022",
		platform: "browser",
		minify,
		sourcemap: false,
		legalComments: "none",
		logLevel: "silent",
	});
	const { size } = await stat(out);
	return { outfile: out, bytes: size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		const { outfile, bytes } = await buildClient();
		const rel = outfile.startsWith(process.cwd() + "/") ? outfile.slice(process.cwd().length + 1) : outfile;
		console.log(`built ${rel} (${bytes} bytes)`);
	} catch (err) {
		console.error(err?.message ?? err);
		process.exit(1);
	}
}
