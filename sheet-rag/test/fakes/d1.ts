import { DatabaseSync, type SQLInputValue } from "node:sqlite";

/**
 * In-memory fake of the Cloudflare D1 binding, backed by Node's built-in
 * `node:sqlite`. It lets database code be unit tested without Cloudflare
 * credentials. Only the subset of the D1 API used by this project is implemented.
 *
 * Foreign keys are enforced, as D1 does.
 *
 * To pass the fake where a `D1Database` is expected, cast it:
 *   const env = { DB: createFakeD1() as unknown as D1Database };
 * The cast is needed because the fake implements only part of the D1 API.
 */

export interface FakeD1Meta {
	changes: number;
	last_row_id: number;
	duration: number;
	rows_read: number;
	rows_written: number;
}

export interface FakeD1Result<T = Record<string, unknown>> {
	results: T[];
	success: true;
	meta: FakeD1Meta;
}

export interface FakeD1ExecResult {
	count: number;
	duration: number;
}

export interface FakeD1PreparedStatement {
	bind(...values: unknown[]): FakeD1PreparedStatement;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	all<T = Record<string, unknown>>(): Promise<FakeD1Result<T>>;
	run<T = Record<string, unknown>>(): Promise<FakeD1Result<T>>;
}

export interface FakeD1 {
	prepare(sql: string): FakeD1PreparedStatement;
	batch<T = Record<string, unknown>>(
		statements: FakeD1PreparedStatement[],
	): Promise<FakeD1Result<T>[]>;
	exec(sql: string): Promise<FakeD1ExecResult>;
}

/** Converts a JS value to a value SQLite accepts. D1 does not accept booleans or undefined. */
function toSqlValue(value: unknown): SQLInputValue {
	if (value === undefined) return null;
	return value as SQLInputValue;
}

export function createFakeD1(): FakeD1 {
	const db = new DatabaseSync(":memory:");
	db.exec("PRAGMA foreign_keys = ON");

	// Runs one statement and returns its rows and change metadata.
	// `changes` and `last_row_id` come from the most recent write on this connection.
	function execute<T>(sql: string, params: SQLInputValue[]): FakeD1Result<T> {
		const started = performance.now();
		const rows = db.prepare(sql).all(...params) as T[];
		const last = db
			.prepare("SELECT changes() AS changes, last_insert_rowid() AS last_row_id")
			.get() as { changes: number; last_row_id: number };
		const duration = performance.now() - started;
		return {
			results: rows,
			success: true,
			meta: {
				changes: Number(last.changes),
				last_row_id: Number(last.last_row_id),
				duration,
				rows_read: rows.length,
				rows_written: Number(last.changes),
			},
		};
	}

	function makeStatement(sql: string, params: SQLInputValue[]): FakeD1PreparedStatement {
		const statement: FakeD1PreparedStatement = {
			bind(...values: unknown[]) {
				return makeStatement(sql, values.map(toSqlValue));
			},
			async first<T>() {
				const { results } = execute<T>(sql, params);
				return results[0] ?? null;
			},
			async all<T>() {
				return execute<T>(sql, params);
			},
			async run<T>() {
				return execute<T>(sql, params);
			},
		};
		return statement;
	}

	return {
		prepare(sql: string) {
			return makeStatement(sql, []);
		},

		// Runs all statements in one transaction. If any statement fails, the
		// whole batch is rolled back and the error is rethrown.
		async batch<T>(statements: FakeD1PreparedStatement[]) {
			const results: FakeD1Result<T>[] = [];
			db.exec("BEGIN");
			try {
				for (const statement of statements) {
					results.push(await statement.all<T>());
				}
				db.exec("COMMIT");
			} catch (error) {
				try {
					db.exec("ROLLBACK");
				} catch {
					// SQLite may already have rolled back the transaction after an error.
				}
				throw error;
			}
			return results;
		},

		async exec(sql: string) {
			const started = performance.now();
			const statements = sql.split(";").filter((part) => part.trim() !== "").length;
			db.exec(sql);
			return { count: statements, duration: performance.now() - started };
		},
	};
}
