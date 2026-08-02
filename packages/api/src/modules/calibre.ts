import { logger } from "../lib/logger";

const log = logger.child({ component: "calibre" });

let ebookConvertCmd: string[] | null = null;

async function tryCommand(cmd: string[]): Promise<boolean> {
	try {
		const proc = Bun.spawn([...cmd, "--version"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		return (await proc.exited) === 0;
	} catch {
		return false;
	}
}

/** Detect Calibre for the optional Send to Kindle EPUB normalization step. */
export async function checkEbookConvertAvailable(): Promise<boolean> {
	if (await tryCommand(["ebook-convert"])) {
		ebookConvertCmd = ["ebook-convert"];
	} else if (
		await tryCommand([
			"flatpak",
			"run",
			"--command=ebook-convert",
			"com.calibre_ebook.calibre",
		])
	) {
		ebookConvertCmd = [
			"flatpak",
			"run",
			"--command=ebook-convert",
			"com.calibre_ebook.calibre",
		];
	}

	if (ebookConvertCmd) {
		log.info(
			{ source: ebookConvertCmd[0] === "flatpak" ? "Flatpak" : "native" },
			"ebook-convert found for Send to Kindle",
		);
	} else {
		log.info("ebook-convert not found; Send to Kindle will use original EPUBs");
	}

	return ebookConvertCmd !== null;
}

export function isEbookConvertAvailable(): boolean {
	return ebookConvertCmd !== null;
}

export function getEbookConvertCmd(): string[] {
	if (!ebookConvertCmd) throw new Error("ebook-convert is not available");
	return ebookConvertCmd;
}
