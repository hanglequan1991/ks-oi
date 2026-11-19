// Wraps a D1 binding so every binding call spends one subrequest. Pure code: types only from Cloudflare.
// Results and errors are passed through unchanged.

import type { SubrequestBudget } from "./budget";

type Budget = Pick<SubrequestBudget, "spend">;

// Maps each wrapped statement to the statement it wraps, so batch() can unwrap them.
const unwrapped = new WeakMap<object, D1PreparedStatement>();

function wrapStatement(statement: D1PreparedStatement, budget: Budget): D1PreparedStatement {
	const proxy = new Proxy(statement, {
		get(target, prop) {
			switch (prop) {
				case "bind":
					return (...values: unknown[]) =>
						wrapStatement(target.bind(...(values as Parameters<D1PreparedStatement["bind"]>)), budget);
				case "run":
				case "all":
				case "first":
				case "raw":
					return (...args: unknown[]) => {
						budget.spend(1);
						return (target[prop] as (...a: unknown[]) => unknown).apply(target, args);
					};
				default: {
					const value = Reflect.get(target, prop, target);
					return typeof value === "function" ? value.bind(target) : value;
				}
			}
		},
	});
	unwrapped.set(proxy, statement);
	return proxy;
}

/** Returns a D1Database that counts binding calls against `budget`. */
export function countingDb(db: D1Database, budget: Budget): D1Database {
	return new Proxy(db, {
		get(target, prop) {
			switch (prop) {
				case "prepare":
					return (sql: string) => wrapStatement(target.prepare(sql), budget);
				case "batch":
					return (statements: D1PreparedStatement[]) => {
						budget.spend(1);
						const inner = statements.map((s) => unwrapped.get(s) ?? s);
						return target.batch(inner);
					};
				case "exec":
				case "dump":
					return (...args: unknown[]) => {
						budget.spend(1);
						return (target[prop] as (...a: unknown[]) => unknown).apply(target, args);
					};
				default: {
					const value = Reflect.get(target, prop, target);
					return typeof value === "function" ? value.bind(target) : value;
				}
			}
		},
	});
}
