import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FakeD1 } from "./d1";

/**
 * Default folder of D1 migrations: `sheet-rag/migrations/`.
 * Uses the working directory (`sheet-rag/`) so the file also loads under Playwright's CJS loader,
 * where ESM-only module metadata is not available. Both vitest and Playwright run from `sheet-rag/`.
 */
const DEFAULT_MIGRATIONS_DIR = join(process.cwd(), "migrations");

/**
 * Returns the full paths of every `*.sql` file in `dir`, sorted by file name.
 * A missing folder gives an empty list.
 */
export function listMigrationFiles(dir: string = DEFAULT_MIGRATIONS_DIR): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.endsWith(".sql") && statSync(join(dir, name)).isFile())
		.sort()
		.map((name) => join(dir, name));
}

/**
 * Applies every `*.sql` file in `dir` to the fake database, in file name order.
 * A missing or empty folder applies nothing and does not throw.
 */
export async function applyMigrations(
	db: FakeD1,
	dir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<void> {
	for (const file of listMigrationFiles(dir)) {
		await db.exec(readFileSync(file, "utf8"));
	}
}
