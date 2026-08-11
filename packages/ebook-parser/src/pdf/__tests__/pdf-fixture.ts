const encoder = new TextEncoder();

export function buildPdfFixture(): Uint8Array {
	const stream = "BT /F1 24 Tf 72 720 Td (Hello PDF) Tj ET";
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`,
		"<< /Title (Fixture PDF) /Author (Ada Lovelace; Grace Hopper) /Subject (Parser fixture) /Keywords (testing, pdf) /CreationDate (D:20260810120000Z) >>",
	];
	let source = "%PDF-1.7\n%âãÏÓ\n";
	const offsets = [0];
	for (const [index, object] of objects.entries()) {
		offsets.push(encoder.encode(source).length);
		source += `${index + 1} 0 obj\n${object}\nendobj\n`;
	}
	const xrefOffset = encoder.encode(source).length;
	source += `xref\n0 ${objects.length + 1}\n`;
	source += "0000000000 65535 f \n";
	for (const offset of offsets.slice(1)) {
		source += `${String(offset).padStart(10, "0")} 00000 n \n`;
	}
	source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R /ID [<00112233445566778899AABBCCDDEEFF><00112233445566778899AABBCCDDEEFF>] >>\n`;
	source += `startxref\n${xrefOffset}\n%%EOF\n`;
	return encoder.encode(source);
}
