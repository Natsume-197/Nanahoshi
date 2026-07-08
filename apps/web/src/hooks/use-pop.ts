import { useCallback, useRef } from "react";

// A quick scale "pop" for confirming a discrete, positive action (like, save,
// add). Driven imperatively via the Web Animations API from an event handler,
// so it fires only on the user's action — never on mount or a background data
// refresh — and needs no `useEffect`. Honors `prefers-reduced-motion`.
const POP_KEYFRAMES: Keyframe[] = [
	{ transform: "scale(1)" },
	{ transform: "scale(1.32)", offset: 0.35 },
	{ transform: "scale(1)" },
];

const POP_OPTIONS: KeyframeAnimationOptions = {
	duration: 320,
	easing: "cubic-bezier(0.22, 1, 0.36, 1)", // ease-out-quint
};

export function usePop<T extends HTMLElement | SVGElement>() {
	const ref = useRef<T>(null);
	const pop = useCallback(() => {
		const el = ref.current;
		if (!el) return;
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
		el.animate(POP_KEYFRAMES, POP_OPTIONS);
	}, []);
	return { ref, pop };
}
