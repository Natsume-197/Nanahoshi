import * as React from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

const useIsomorphicLayoutEffect =
	typeof window !== "undefined" ? React.useLayoutEffect : useMountEffect;

export { useIsomorphicLayoutEffect };
