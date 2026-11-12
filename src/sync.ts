import { fetchTabCsv, listFolder, listTabs } from "./google";
import { embed } from "./rag";
import { sha256Hex, sheetToChunks } from "./sheet";

export interface Bindings {
	AI: Ai;
	VECTORIZE: VectorizeIndex;
	SYNC_STATE: KVNamespace;
	REINDEX_QUEUE: Queue<SyncMessage>;
	DRIVE_FOLDER_ID: string;
	SKIP_TABS: string[];
	ADMIN_TOKEN?: string;
}

export type SyncMessage =
	| { type: "file"; fileId: string; name: string; modified: string; force: boolean }
	| { type: "tab"; fileId: string; fileName: string; gid: string; tabName: string; force: boolean }
	| { type: "drop-tab"; fileId: string; gid: string };

type FileState = { name: string; modified: string; gids: string[] };
type TabState = { hash: string; ids: string[]; file: string; tab: string; updatedAt: string };

// Bump when chunking changes so every tab is re-embedded on the next sync.
const CHUNKER_VERSION = "2";
const EMBED_BATCH = 20;

const fileKey = (fileId: string) => `file:${fileId}`;
const tabKey = (fileId: string, gid: string) => `tab:${fileId}:${gid}`;
const FOLDER_KEY = "folder:files";

async function sendAll(queue: Queue<SyncMessage>, messages: SyncMessage[]) {
	for (let i = 0; i < messages.length; i += 100) {
		await queue.sendBatch(messages.slice(i, i + 100).map((body) => ({ body })));
	}
}

// Cron entry point: one cheap request to the folder page decides which files changed.
export async function planSync(env: Bindings, opts: { force?: boolean; fileId?: string } = {}) {
	const all = await listFolder(env.DRIVE_FOLDER_ID);
	const files = opts.fileId ? all.filter((f) => f.id === opts.fileId) : all;
	if (opts.fileId && !files.length) throw new Error(`File ${opts.fileId} is not in the folder`);

	const messages: SyncMessage[] = [];
	let removedFiles = 0;

	if (!opts.fileId) {
		const known = (await env.SYNC_STATE.get<string[]>(FOLDER_KEY, "json")) ?? [];
		const current = new Set(all.map((f) => f.id));
		for (const id of known.filter((k) => !current.has(k))) {
			const state = await env.SYNC_STATE.get<FileState>(fileKey(id), "json");
			for (const gid of state?.gids ?? []) messages.push({ type: "drop-tab", fileId: id, gid });
			await env.SYNC_STATE.delete(fileKey(id));
			removedFiles++;
		}
		await env.SYNC_STATE.put(FOLDER_KEY, JSON.stringify([...current]));
	}

	let changedFiles = 0;
	for (const f of files) {
		const state = await env.SYNC_STATE.get<FileState>(fileKey(f.id), "json");
		if (opts.force || !state || state.modified !== f.modified) {
			messages.push({ type: "file", fileId: f.id, name: f.name, modified: f.modified, force: !!opts.force });
			changedFiles++;
		}
	}

	await sendAll(env.REINDEX_QUEUE, messages);
	return { filesInFolder: all.length, changedFiles, removedFiles, queued: messages.length };
}

async function syncFile(env: Bindings, msg: Extract<SyncMessage, { type: "file" }>) {
	const tabs = await listTabs(msg.fileId);
	const skip = new Set(env.SKIP_TABS.map((s) => s.trim()));
	const kept = tabs.filter((t) => !skip.has(`${msg.name.trim()}/${t.name.trim()}`));
	const keptGids = new Set(kept.map((t) => t.gid));

	const previous = await env.SYNC_STATE.get<FileState>(fileKey(msg.fileId), "json");
	const messages: SyncMessage[] = kept.map((t) => ({
		type: "tab",
		fileId: msg.fileId,
		fileName: msg.name,
		gid: t.gid,
		tabName: t.name,
		force: msg.force,
	}));
	for (const gid of previous?.gids ?? []) {
		if (!keptGids.has(gid)) messages.push({ type: "drop-tab", fileId: msg.fileId, gid });
	}

	await sendAll(env.REINDEX_QUEUE, messages);
	const state: FileState = { name: msg.name, modified: msg.modified, gids: [...keptGids] };
	await env.SYNC_STATE.put(fileKey(msg.fileId), JSON.stringify(state));
}

async function syncTab(env: Bindings, msg: Extract<SyncMessage, { type: "tab" }>) {
	const csv = await fetchTabCsv(msg.fileId, msg.gid);
	const hash = await sha256Hex(`${CHUNKER_VERSION}\n${csv}`);
	const key = tabKey(msg.fileId, msg.gid);
	const previous = await env.SYNC_STATE.get<TabState>(key, "json");
	if (!msg.force && previous?.hash === hash) return;

	const fileLabel = msg.fileName.replace(/\.xlsx$/i, "").trim();
	const chunks = sheetToChunks(csv, `${fileLabel} › ${msg.tabName.trim()}`);
	const prefix = `${(await sha256Hex(msg.fileId)).slice(0, 8)}-${msg.gid}`;
	const ids: string[] = [];

	for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
		const batch = chunks.slice(i, i + EMBED_BATCH);
		const vectors = await embed(
			env.AI,
			batch.map((c) => c.text),
		);
		await env.VECTORIZE.upsert(
			batch.map((c, j) => {
				const id = `${prefix}-${c.key}`;
				ids.push(id);
				return {
					id,
					values: vectors[j],
					metadata: { text: c.text, file: fileLabel, tab: msg.tabName.trim(), fileId: msg.fileId, gid: msg.gid },
				};
			}),
		);
	}

	const current = new Set(ids);
	const stale = (previous?.ids ?? []).filter((id) => !current.has(id));
	if (stale.length) await env.VECTORIZE.deleteByIds(stale);

	const state: TabState = { hash, ids, file: fileLabel, tab: msg.tabName.trim(), updatedAt: new Date().toISOString() };
	await env.SYNC_STATE.put(key, JSON.stringify(state));
}

async function dropTab(env: Bindings, msg: Extract<SyncMessage, { type: "drop-tab" }>) {
	const key = tabKey(msg.fileId, msg.gid);
	const previous = await env.SYNC_STATE.get<TabState>(key, "json");
	if (previous?.ids.length) await env.VECTORIZE.deleteByIds(previous.ids);
	await env.SYNC_STATE.delete(key);
}

export async function handleMessage(env: Bindings, msg: SyncMessage) {
	if (msg.type === "file") return syncFile(env, msg);
	if (msg.type === "tab") return syncTab(env, msg);
	return dropTab(env, msg);
}

export async function syncStatus(env: Bindings) {
	const tabs = await env.SYNC_STATE.list({ prefix: "tab:" });
	const files = await env.SYNC_STATE.list({ prefix: "file:" });
	const index = await env.VECTORIZE.describe();
	return {
		filesTracked: files.keys.length,
		tabsIndexed: tabs.list_complete ? tabs.keys.length : `${tabs.keys.length}+`,
		vectors: (index as any).vectorCount ?? (index as any).vectorsCount,
	};
}
