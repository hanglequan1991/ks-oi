import { chat, search, type ChatTurn } from "./rag";
import { handleMessage, planSync, syncStatus, type Bindings, type SyncMessage } from "./sync";

function isAdmin(req: Request, env: Bindings): boolean {
	return !!env.ADMIN_TOKEN && req.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`;
}

export default {
	async fetch(req: Request, env: Bindings): Promise<Response> {
		const url = new URL(req.url);
		try {
			if (url.pathname === "/chat" && req.method === "POST") {
				const { question, history } = (await req.json()) as { question?: string; history?: ChatTurn[] };
				if (!question?.trim()) return Response.json({ error: "question is required" }, { status: 400 });
				return Response.json(await chat(env.AI, env.VECTORIZE, question.trim(), history ?? []));
			}
			if (url.pathname === "/search") {
				return Response.json(await search(env.AI, env.VECTORIZE, url.searchParams.get("q") ?? ""));
			}
			if (url.pathname.startsWith("/admin/")) {
				if (!isAdmin(req, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
				if (url.pathname === "/admin/reindex" && req.method === "POST") {
					const force = url.searchParams.get("force") === "1";
					const fileId = url.searchParams.get("file") ?? undefined;
					return Response.json(await planSync(env, { force, fileId }));
				}
				if (url.pathname === "/admin/status") return Response.json(await syncStatus(env));
			}
			return new Response("Not found", { status: 404 });
		} catch (e: any) {
			return Response.json({ error: e.message ?? String(e) }, { status: 500 });
		}
	},

	async scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
		ctx.waitUntil(
			planSync(env).then(
				(r) => console.log("sync planned", JSON.stringify(r)),
				(e) => console.error("sync planning failed", e),
			),
		);
	},

	async queue(batch: MessageBatch<SyncMessage>, env: Bindings) {
		for (const msg of batch.messages) {
			try {
				await handleMessage(env, msg.body);
				msg.ack();
			} catch (e) {
				console.error("sync message failed", JSON.stringify(msg.body), e);
				msg.retry({ delaySeconds: 60 });
			}
		}
	},
};
