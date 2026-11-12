export type MediaImage = { id: string; title: string };
export type MediaAlbum = { name: string; url: string; images: MediaImage[]; public: boolean };
export type MediaLink = { label: string; url: string };
export type TabMedia = { albums: MediaAlbum[]; links: MediaLink[]; roots: MediaLink[] };

export type ChatMedia = {
	hotel: string;
	album?: { name: string; url: string };
	images: { title: string; thumb: string; full: string }[];
	links: MediaLink[];
};

const MAX_SUBFOLDERS = 12;
// Each folder page is one subrequest; a queue invocation may make 50 in total.
const MAX_FOLDER_FETCHES = 24;
const MAX_IMAGES_PER_ALBUM = 12;
const MAX_IMAGES_SHOWN = 6;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|bmp)$/i;

const decodeHtml = (s: string) =>
	s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

const folderId = (url: string) => url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/)?.[1];

export function extractLinks(csv: string): MediaLink[] {
	const seen = new Set<string>();
	const links: MediaLink[] = [];
	for (const line of csv.split(/\r?\n/)) {
		const urls = line.match(/https?:\/\/[^\s",]+/g);
		if (!urls) continue;
		const label =
			line
				.split(",")
				.map((c) => c.replace(/^"|"$/g, "").trim())
				.find((c) => c && !/^https?:\/\//.test(c))
				?.replace(/[:：]\s*$/, "")
				.trim() || "Link";
		for (const url of urls) {
			if (seen.has(url)) continue;
			seen.add(url);
			links.push({ label, url });
		}
	}
	return links;
}

type FolderEntry = { id: string; title: string; folder: boolean; image: boolean };

type Budget = { left: number };

async function listDriveFolder(id: string, budget: Budget): Promise<FolderEntry[] | null> {
	if (budget.left-- <= 0) return [];
	const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}`);
	if (!res.ok) return null;
	const html = await res.text();
	const entries: FolderEntry[] = [];
	const entry = /<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?href="([^"]+)"([\s\S]*?)flip-entry-title">([^<]*)</g;
	for (const m of html.matchAll(entry)) {
		const title = decodeHtml(m[4]);
		const folder = m[2].includes("/folders/");
		entries.push({ id: m[1], title, folder, image: !folder && (m[3].includes("type/image/") || IMAGE_EXT.test(title)) });
	}
	return entries;
}

const toImages = (entries: FolderEntry[]) =>
	entries
		.filter((e) => e.image)
		.slice(0, MAX_IMAGES_PER_ALBUM)
		.map((e) => ({ id: e.id, title: e.title.replace(IMAGE_EXT, "") }));

// Hotels usually share one Drive folder per property with a subfolder per room type,
// so one level of subfolders gives albums that can be matched to the question.
async function crawlDriveAlbum(id: string, url: string, name: string, budget: Budget): Promise<MediaAlbum[]> {
	const entries = await listDriveFolder(id, budget);
	if (!entries) return [{ name, url, images: [], public: false }];
	const albums: MediaAlbum[] = [];
	const own = toImages(entries);
	if (own.length) albums.push({ name, url, images: own, public: true });
	for (const sub of entries.filter((e) => e.folder).slice(0, MAX_SUBFOLDERS)) {
		const subEntries = await listDriveFolder(sub.id, budget);
		const images = subEntries ? toImages(subEntries) : [];
		if (images.length) {
			albums.push({ name: sub.title, url: `https://drive.google.com/drive/folders/${sub.id}`, images, public: true });
		}
	}
	if (!albums.length) albums.push({ name, url, images: [], public: true });
	return albums;
}

export async function collectMedia(csv: string): Promise<TabMedia> {
	const albums: MediaAlbum[] = [];
	const links: MediaLink[] = [];
	const roots: MediaLink[] = [];
	const budget: Budget = { left: MAX_FOLDER_FETCHES };
	for (const link of extractLinks(csv)) {
		const folder = folderId(link.url);
		if (folder) {
			try {
				const found = await crawlDriveAlbum(folder, link.url, link.label, budget);
				albums.push(...found);
				if (found.some((a) => a.images.length)) roots.push(link);
			} catch {
				links.push(link);
			}
		} else if (!/docs\.google\.com\/spreadsheets/.test(link.url)) {
			links.push(link);
		}
	}
	return { albums, links, roots };
}

const normalize = (s: string) =>
	s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/đ/g, "d");

const tokens = (s: string) => new Set(normalize(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3));

const thumb = (id: string, size: number) => `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;

export function pickMedia(media: TabMedia, hotel: string, question: string): ChatMedia | null {
	const withImages = media.albums.filter((a) => a.images.length);
	const asked = tokens(question);
	let best: MediaAlbum | undefined;
	let bestScore = 0;
	for (const album of withImages) {
		let score = 0;
		for (const t of tokens(album.name)) if (asked.has(t)) score++;
		if (score > bestScore) [best, bestScore] = [album, score];
	}

	// No room type named in the question: show one photo from each album as an overview.
	const picked = best
		? best.images.slice(0, MAX_IMAGES_SHOWN)
		: withImages.flatMap((a) => a.images.slice(0, Math.max(1, Math.ceil(MAX_IMAGES_SHOWN / withImages.length)))).slice(0, MAX_IMAGES_SHOWN);

	const links = [
		...media.albums
			.filter((a) => !a.images.length)
			.map((a) => ({ label: a.public ? a.name : `${a.name} (cần quyền truy cập)`, url: a.url })),
		...media.links,
	];
	if (!picked.length && !links.length) return null;
	const root = media.roots[0];
	const album = !picked.length ? undefined : best ? { name: best.name, url: best.url } : root && { name: root.label, url: root.url };
	return {
		hotel,
		album,
		images: picked.map((img) => ({ title: img.title, thumb: thumb(img.id, 400), full: thumb(img.id, 1600) })),
		links: links.filter((l) => l.url !== album?.url),
	};
}
