/**
 * Identity key for person names (authors, narrators). Aggressive normalization
 * only for Japanese names — spacing and separators are not identity there
 * (入間 人間 ≡ 入間人間); Latin names stay near-verbatim (NFKC + trim +
 * collapsed whitespace) so distinct people aren't over-merged.
 *
 * Must stay in sync with the `name_normalized` generated column in
 * packages/db/src/schema/general.ts — SQL is the source of truth for identity;
 * this mirror only serves in-batch dedupe and clash checks.
 */
export function normalizePersonName(name: string): string {
	const nfkc = name.normalize("NFKC").trim();
	if (
		/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々〆]/u.test(nfkc)
	)
		return nfkc.toLocaleLowerCase().replace(/[\s・･·=＝]+/gu, "");
	return nfkc.replace(/\s+/g, " ");
}
