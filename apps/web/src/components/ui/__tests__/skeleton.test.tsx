import { describe, expect, it } from "bun:test";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Skeleton } from "../skeleton";

describe("Skeleton", () => {
	it("renders a div with the foreground-derived default color", () => {
		const html = renderToStaticMarkup(<Skeleton />);

		expect(html).toStartWith("<div");
		expect(html).toContain("bg-foreground/10");
	});

	it("can render an inline span root", () => {
		const html = renderToStaticMarkup(<Skeleton as="span" />);

		expect(html).toStartWith("<span");
		expect(html).not.toContain("<div");
	});

	it("uses the adaptive card surface for the surface variant", () => {
		const html = renderToStaticMarkup(<Skeleton variant="surface" />);

		expect(html).toContain("bg-surface-card");
		expect(html).not.toContain("bg-foreground/10");
	});

	it("retains caller classes", () => {
		const html = renderToStaticMarkup(
			<Skeleton className="h-4 w-24 rounded" />,
		);

		expect(html).toContain("h-4");
		expect(html).toContain("w-24");
		expect(html).toContain("rounded");
	});

	it("types refs according to the selected root", () => {
		const divRef = createRef<HTMLDivElement>();
		const spanRef = createRef<HTMLSpanElement>();
		const divSkeleton = <Skeleton ref={divRef} />;
		const spanSkeleton = <Skeleton as="span" ref={spanRef} />;

		// @ts-expect-error The default div root cannot receive a span ref.
		const invalidDivSkeleton = <Skeleton ref={spanRef} />;

		expect(divSkeleton.props.ref).toBe(divRef);
		expect(spanSkeleton.props.ref).toBe(spanRef);
		void invalidDivSkeleton;
	});
});
