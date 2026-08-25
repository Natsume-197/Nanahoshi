import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sectionSource = readFileSync(
	new URL("./read-listen-section.tsx", import.meta.url),
	"utf8",
);

describe("Honomiya generation recovery", () => {
	test("offers one alignment action for retry, replacement, import, or generation", () => {
		expect(sectionSource).toContain("setPairingToAddAlignment(pairing)");
		expect(sectionSource).toContain('? m["read_listen.retry_alignment"]()');
		expect(sectionSource).toContain('? m["read_listen.replace_alignment"]()');
		expect(sectionSource).toContain("<AlignmentInputDialog");
	});

	test("presents SRT verification as an explicit opt-in", () => {
		expect(sectionSource).toContain(
			"const [verifyTimedText, setVerifyTimedText] = useState(false)",
		);
		expect(sectionSource).toContain("<Switch");
		expect(sectionSource).toContain("verifyTimedText,");
	});

	test("labels known alignment provenance as External or Honomiya", () => {
		expect(sectionSource).toContain("alignment.artifact.origin");
		expect(sectionSource).toContain('alignment.artifact.origin === "external"');
		expect(sectionSource).toContain('m["read_listen.origin_external"]()');
		expect(sectionSource).toContain('m["read_listen.origin_honomiya"]()');
	});

	test("shows the persisted generation error when alignment fails", () => {
		expect(sectionSource).toContain("pairing.generation.error");
	});
});
