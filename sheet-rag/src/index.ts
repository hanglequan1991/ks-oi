import { clearSessionCookie, createSessionCookie, readSession, verifyGoogleIdToken } from "./auth";
import { chat, search, type ChatTurn } from "./rag";
import { handleMessage, planSync, syncStatus, tabMedia, type Bindings, type SyncMessage } from "./sync";

function isAdmin(req: Request, env: Bindings): boolean {
	return !!env.ADMIN_TOKEN && req.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`;
}

const asset = (env: Bindings, req: Request, path: string) => env.ASSETS.fetch(new Request(new URL(path, req.url), req));

async function handleAuth(req: Request, env: Bindings, url: URL): Promise<Response> {
	if (url.pathname === "/auth/config") {
		return Response.json({ clientId: env.GOOGLE_CLIENT_ID || null });
	}
	if (url.pathname === "/auth/google" && req.method === "POST") {
		if (!env.SESSION_SECRET) return Response.json({ error: "Server is missing SESSION_SECRET" }, { status: 500 });
		const { credential } = (await req.json()) as { credential?: string };
		if (!credential) return Response.json({ error: "credential is required" }, { status: 400 });
		try {
			const user = await verifyGoogleIdToken(credential, env);
			return Response.json(user, { headers: { "set-cookie": await createSessionCookie(user, env.SESSION_SECRET) } });
		} catch (e: any) {
			const notAllowed = e.message === "not_allowed";
			return Response.json(
				{ error: notAllowed ? "Tài khoản này chưa được cấp quyền truy cập." : "Đăng nhập thất bại, vui lòng thử lại." },
				{ status: notAllowed ? 403 : 401 },
			);
		}
	}
	if (url.pathname === "/auth/logout" && req.method === "POST") {
		return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
	}
	return new Response("Not found", { status: 404 });
}

// Must match the weekly entry in wrangler.jsonc triggers.crons.
const MEDIA_REFRESH_CRON = "0 20 * * 6";

export default {
	async fetch(req: Request, env: Bindings): Promise<Response> {
		const url = new URL(req.url);
		try {
			if (url.pathname.startsWith("/auth/")) return handleAuth(req, env, url);

			if (url.pathname.startsWith("/admin/")) {
				if (!isAdmin(req, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
				if (url.pathname === "/admin/reindex" && req.method === "POST") {
					const force = url.searchParams.get("force") === "1";
					const fileId = url.searchParams.get("file") ?? undefined;
					const refreshMedia = url.searchParams.get("media") === "1";
					return Response.json(await planSync(env, { force, fileId, refreshMedia }));
				}
				if (url.pathname === "/admin/status") return Response.json(await syncStatus(env));
				return new Response("Not found", { status: 404 });
			}

			const session = await readSession(req, env);

			if (url.pathname === "/") {
				const page = await asset(env, req, session ? "/" : "/login");
				const res = new Response(page.body, page);
				res.headers.set("cache-control", "no-store");
				return res;
			}

			if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });

			if (url.pathname === "/me") {
				return Response.json({ email: session.email, name: session.name });
			}
			if (url.pathname === "/chat" && req.method === "POST") {
				const { question, history } = (await req.json()) as { question?: string; history?: ChatTurn[] };
				if (!question?.trim()) return Response.json({ error: "question is required" }, { status: 400 });
				return Response.json(
					await chat(env.AI, env.VECTORIZE, question.trim(), history ?? [], (fileId, gid) => tabMedia(env, fileId, gid)),
				);
			}
			if (url.pathname === "/search") {
				return Response.json(await search(env.AI, env.VECTORIZE, url.searchParams.get("q") ?? ""));
			}
			return new Response("Not found", { status: 404 });
		} catch (e: any) {
			return Response.json({ error: e.message ?? String(e) }, { status: 500 });
		}
	},

	async scheduled(event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
		const refreshMedia = event.cron === MEDIA_REFRESH_CRON;
		ctx.waitUntil(
			planSync(env, { refreshMedia }).then(
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
