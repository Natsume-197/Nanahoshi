export interface ComicArchive {
	names(): readonly string[];
	read(name: string): Promise<Uint8Array | undefined>;
	close(): Promise<void>;
}
