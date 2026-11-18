import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { FakeD1 } from "./d1";

/** Default folder of D1 migrations: `sheet-rag/migrations/`. */
const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations", import.meta.url));

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
