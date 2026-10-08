#!/usr/bin/env python3
"""Subsets Gen Interface JP to what the app shows: Latin, Greek, Cyrillic,
punctuation and symbols, kana, and the JIS X 0208/0213 kanji. Anything else
(rare kanji, Hangul) falls back to the system font per glyph.

Usage: scripts/subset-fonts.py <dir with the full GenInterfaceJP-*.ttf>
Writes into assets/fonts/. Needs fonttools (pyftsubset).
"""

import subprocess
import sys
from pathlib import Path

WEIGHTS = ["Regular", "Medium", "SemiBold", "Bold"]
UNICODES = ",".join(
	[
		"U+0000-024F",  # Latin
		"U+0370-03FF",  # Greek
		"U+0400-04FF",  # Cyrillic
		"U+1E00-1EFF",  # Latin extended additional
		"U+2000-22FF",  # punctuation, currency, letterlike, arrows, math
		"U+2460-26FF",  # enclosed, box drawing, shapes, symbols
		"U+3000-30FF",  # CJK punctuation, kana
		"U+31F0-31FF",  # small kana
		"U+FF00-FFEF",  # full- and half-width forms
	]
)


def jis_kanji() -> str:
	chars: set[str] = set()
	for codec in ("euc_jp", "euc_jis_2004"):
		for a in range(0xA1, 0xFF):
			for b in range(0xA1, 0xFF):
				try:
					chars.add(bytes([a, b]).decode(codec))
				except UnicodeDecodeError:
					pass
	return "".join(sorted(chars))


def main() -> None:
	source = Path(sys.argv[1])
	out = Path(__file__).resolve().parent.parent / "assets" / "fonts"
	text = out / ".jis.txt"
	text.write_text(jis_kanji(), encoding="utf-8")
	try:
		for weight in WEIGHTS:
			name = f"GenInterfaceJP-{weight}.ttf"
			subprocess.run(
				[
					"pyftsubset",
					str(source / name),
					f"--unicodes={UNICODES}",
					f"--text-file={text}",
					"--layout-features=*",
					"--glyph-names=false",
					f"--output-file={out / name}",
				],
				check=True,
			)
			print(name, (out / name).stat().st_size)
	finally:
		text.unlink()


if __name__ == "__main__":
	main()
