import path from "node:path";

let ffprobeCmd: string[] | null = null;

const TIMEOUT_MS = 30 * 1000; // 30 seconds per file

async function tryCommand(cmd: string[]): Promise<boolean> {
	try {
		const proc = Bun.spawn([...cmd, "-version"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		return (await proc.exited) === 0;
	} catch {
		return false;
	}
}

export async function checkFfprobeAvailable(): Promise<boolean> {
	if (await tryCommand(["ffprobe"])) {
		ffprobeCmd = ["ffprobe"];
	} else if (
		await tryCommand([
			"flatpak",
			"run",
			"--command=ffprobe",
			"org.ffmpeg.FFmpeg",
		])
	) {
		ffprobeCmd = ["flatpak", "run", "--command=ffprobe", "org.ffmpeg.FFmpeg"];
	}

	if (ffprobeCmd) {
		console.log(
			`[AudioProbe] ffprobe found (${ffprobeCmd[0] === "flatpak" ? "Flatpak" : "native"}). Audiobook support is enabled.`,
		);
	} else {
		console.warn(
			"[AudioProbe] ⚠ ffprobe not found. Audiobook libraries will not work. Install FFmpeg to enable audiobook support.",
		);
	}

	return ffprobeCmd !== null;
}

export function isFfprobeAvailable(): boolean {
	return ffprobeCmd !== null;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type AudioFileProbeResult = {
	duration: number;
	codec: string | null;
	bitRate: number | null;
	channels: number | null;
	sampleRate: number | null;
	format: string | null;
	mimeType: string | null;
	tags: Record<string, string>;
	chapters: AudioChapter[];
};

export type AudioChapter = {
	index: number;
	title: string | null;
	startTime: number;
	endTime: number;
};

type FfprobeStreamJson = {
	codec_name?: string;
	channels?: number;
	sample_rate?: string;
	bit_rate?: string;
	duration?: string;
};

type FfprobeFormatJson = {
	duration?: string;
	bit_rate?: string;
	format_name?: string;
	tags?: Record<string, string>;
};

type FfprobeChapterJson = {
	id?: number;
	start_time?: string;
	end_time?: string;
	tags?: { title?: string };
};

type FfprobeOutput = {
	streams?: FfprobeStreamJson[];
	format?: FfprobeFormatJson;
	chapters?: FfprobeChapterJson[];
};

// ── Probe function ───────────────────────────────────────────────────────────

export async function probeAudioFile(
	filePath: string,
): Promise<AudioFileProbeResult> {
	if (!ffprobeCmd) {
		throw new Error(
			"ffprobe is not available. Install FFmpeg to enable audiobook support.",
		);
	}

	const args = [
		...ffprobeCmd,
		"-v",
		"quiet",
		"-print_format",
		"json",
		"-show_format",
		"-show_streams",
		"-show_chapters",
		"-select_streams",
		"a:0",
		filePath,
	];

	const proc = Bun.spawn(args, {
		stdout: "pipe",
		stderr: "pipe",
	});

	const exitCode = await Promise.race([
		proc.exited,
		new Promise<never>((_, reject) =>
			setTimeout(() => {
				proc.kill();
				reject(
					new Error(
						`ffprobe timed out after ${TIMEOUT_MS / 1000}s for ${filePath}`,
					),
				);
			}, TIMEOUT_MS),
		),
	]);

	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(
			`ffprobe failed with exit code ${exitCode} for ${filePath}: ${stderr}`,
		);
	}

	const stdout = await new Response(proc.stdout).text();
	const data: FfprobeOutput = JSON.parse(stdout);

	const audioStream = data.streams?.[0];
	const format = data.format;

	const duration =
		Number.parseFloat(audioStream?.duration ?? "") ||
		Number.parseFloat(format?.duration ?? "") ||
		0;

	const codec = audioStream?.codec_name ?? null;
	const bitRate =
		Math.round(Number.parseInt(audioStream?.bit_rate ?? "", 10) / 1000) ||
		Math.round(Number.parseInt(format?.bit_rate ?? "", 10) / 1000) ||
		null;
	const channels = audioStream?.channels ?? null;
	const sampleRate =
		Number.parseInt(audioStream?.sample_rate ?? "", 10) || null;
	const formatName = format?.format_name ?? null;
	const mimeType = getMimeType(filePath);

	const tags: Record<string, string> = {};
	if (format?.tags) {
		for (const [key, value] of Object.entries(format.tags)) {
			if (typeof value === "string") {
				tags[key.toLowerCase()] = value;
			}
		}
	}

	const chapters: AudioChapter[] = (data.chapters ?? []).map((ch, index) => ({
		index,
		title: ch.tags?.title ?? null,
		startTime: Number.parseFloat(ch.start_time ?? "0"),
		endTime: Number.parseFloat(ch.end_time ?? "0"),
	}));

	return {
		duration,
		codec,
		bitRate,
		channels,
		sampleRate,
		format: formatName,
		mimeType,
		tags,
		chapters,
	};
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const EXTENSION_TO_MIME: Record<string, string> = {
	".m4b": "audio/mp4",
	".m4a": "audio/mp4",
	".mp3": "audio/mpeg",
	".ogg": "audio/ogg",
	".opus": "audio/opus",
	".flac": "audio/flac",
	".wma": "audio/x-ms-wma",
};

function getMimeType(filePath: string): string | null {
	const ext = path.extname(filePath).toLowerCase();
	return EXTENSION_TO_MIME[ext] ?? null;
}

export function getAudioMimeType(filename: string): string | null {
	return getMimeType(filename);
}
