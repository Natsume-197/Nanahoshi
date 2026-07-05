// Audible regional catalogs, used by audiobook libraries (wizard + detail).
export const AUDIBLE_REGIONS = [
	{ value: "us", label: "Audible US (.com)" },
	{ value: "jp", label: "Audible Japan (.co.jp)" },
	{ value: "uk", label: "Audible UK (.co.uk)" },
	{ value: "de", label: "Audible Germany (.de)" },
	{ value: "fr", label: "Audible France (.fr)" },
	{ value: "es", label: "Audible Spain (.es)" },
	{ value: "it", label: "Audible Italy (.it)" },
	{ value: "ca", label: "Audible Canada (.ca)" },
	{ value: "au", label: "Audible Australia (.com.au)" },
	{ value: "in", label: "Audible India (.in)" },
] as const;

export const DEFAULT_AUDIBLE_REGION = "us";
