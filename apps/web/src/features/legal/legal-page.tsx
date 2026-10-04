import { getLocale } from "@/paraglide/runtime";
import { type LegalKind, legalDoc } from "./legal-content";

/** A plain reading page for the server's built-in legal documents. */
export function LegalPage({ kind }: { kind: LegalKind }) {
	const doc = legalDoc(kind, getLocale());
	return (
		<main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-4 py-12 md:py-20">
			<header className="flex flex-col gap-2">
				<h1 className="text-balance font-semibold text-3xl text-foreground">
					{doc.title}
				</h1>
				<p className="text-muted-foreground text-sm">{doc.updated}</p>
			</header>
			<p className="text-pretty text-base text-foreground leading-relaxed">
				{doc.intro}
			</p>
			{doc.sections.map((section) => (
				<section key={section.heading} className="flex flex-col gap-3">
					<h2 className="font-semibold text-foreground text-lg">
						{section.heading}
					</h2>
					<ul className="flex list-disc flex-col gap-2 pl-5 text-base text-foreground leading-relaxed">
						{section.body.map((line) => (
							<li key={line} className="text-pretty">
								{line}
							</li>
						))}
					</ul>
				</section>
			))}
		</main>
	);
}
