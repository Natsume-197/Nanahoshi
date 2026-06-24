import { z } from "zod";

export const GetSignedDownloadUrlInput = z.object({ uuid: z.string() });

export const GetSeriesDownloadUrlInput = z.object({
	seriesName: z.string().min(1),
});

export const GetDirectoriesInput = z.object({ location: z.string() });
