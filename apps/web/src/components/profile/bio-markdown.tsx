import { Fragment } from "react";

const IMAGE_URL = /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif)(?:\?\S*)?$/i;

// Inline tokens: ![alt](url) images, [text](url) links, **bold**, *italic*,
// and bare URLs (image URLs render as embeds, others as links).
const INLINE_TOKEN =
	/(!\[[^\]]*\]\([^)\s]+\)|\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/[^\s<>"')\]]+)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	const parts = text.split(INLINE_TOKEN);

	parts.forEach((part, i) => {
		if (!part) return;
		const key = `${keyPrefix}-${i}`;

		const image = part.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
		if (image?.[2]) {
			nodes.push(<BioImage key={key} src={image[2]} alt={image[1] ?? ""} />);
			return;
		}

		const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
		if (link?.[1] && link[2]) {
			nodes.push(<BioLink key={key} href={link[2]} label={link[1]} />);
			return;
		}

		const bold = part.match(/^\*\*([^*]+)\*\*$/);
		if (bold?.[1]) {
			nodes.push(
				<strong key={key} className="font-semibold text-foreground">
					{bold[1]}
				</strong>,
			);
			return;
		}

		const italic = part.match(/^\*([^*]+)\*$/);
		if (italic?.[1]) {
			nodes.push(<em key={key}>{italic[1]}</em>);
			return;
		}

		if (/^https?:\/\//.test(part)) {
			if (IMAGE_URL.test(part)) {
				nodes.push(<BioImage key={key} src={part} alt="" />);
			} else {
				nodes.push(<BioLink key={key} href={part} label={part} />);
			}
			return;
		}

		nodes.push(<Fragment key={key}>{part}</Fragment>);
	});

	return nodes;
}

function isSafeUrl(url: string) {
	return /^https?:\/\//i.test(url);
}

function BioImage({ src, alt }: { src: string; alt: string }) {
	if (!isSafeUrl(src)) return null;
	return (
		<img
			src={src}
			alt={alt}
			loading="lazy"
			decoding="async"
			referrerPolicy="no-referrer"
			className="my-1 inline-block max-h-64 max-w-full rounded-lg align-middle"
		/>
	);
}

function BioLink({ href, label }: { href: string; label: string }) {
	if (!isSafeUrl(href)) return <span>{label}</span>;
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="break-all text-[var(--profile-accent,var(--primary))] underline-offset-2 hover:underline"
		>
			{label}
		</a>
	);
}

/** Renders a profile bio with a small markdown subset: paragraphs, line
 *  breaks, bold/italic, links, and image/gif embeds (markdown or bare URL). */
export function BioMarkdown({ text }: { text: string }) {
	const paragraphs = text.split(/\n{2,}/);

	return (
		<div className="space-y-2.5 text-sm leading-relaxed">
			{paragraphs.map((paragraph, pIndex) => {
				const lines = paragraph.split("\n");
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: static text, order-stable
					<p key={pIndex}>
						{lines.map((line, lIndex) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static text, order-stable
							<Fragment key={lIndex}>
								{lIndex > 0 && <br />}
								{renderInline(line, `${pIndex}-${lIndex}`)}
							</Fragment>
						))}
					</p>
				);
			})}
		</div>
	);
}
