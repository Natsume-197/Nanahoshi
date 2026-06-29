// Amazon regional stores. Shared between the org-level default (settings) and
// the per-library override (library detail).
export const AMAZON_DOMAINS = [
	{ value: "co.jp", label: "Amazon Japan (co.jp)" },
	{ value: "com", label: "Amazon US (com)" },
	{ value: "co.uk", label: "Amazon UK (co.uk)" },
	{ value: "de", label: "Amazon Germany (de)" },
	{ value: "fr", label: "Amazon France (fr)" },
	{ value: "es", label: "Amazon Spain (es)" },
	{ value: "it", label: "Amazon Italy (it)" },
	{ value: "ca", label: "Amazon Canada (ca)" },
	{ value: "com.au", label: "Amazon Australia (com.au)" },
	{ value: "com.br", label: "Amazon Brazil (com.br)" },
	{ value: "com.mx", label: "Amazon Mexico (com.mx)" },
	{ value: "nl", label: "Amazon Netherlands (nl)" },
	{ value: "se", label: "Amazon Sweden (se)" },
	{ value: "pl", label: "Amazon Poland (pl)" },
] as const;
