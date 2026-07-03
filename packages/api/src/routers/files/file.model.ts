import { z } from "zod";

export const GetSignedDownloadUrlInput = z.object({ uuid: z.string() });

export const GetSeriesDownloadUrlInput = z.object({
	seriesUuid: z.string().uuid(),
});

export const GetDirectoriesInput = z.object({ location: z.string() });
