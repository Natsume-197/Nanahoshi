export interface ZipArchive {
	has(name: string): boolean;
	names(): string[];
	text(name: string): Promise<string | undefined>;
	bytes(name: string): Promise<Uint8Array | undefined>;
	close(): Promise<void>;
}
