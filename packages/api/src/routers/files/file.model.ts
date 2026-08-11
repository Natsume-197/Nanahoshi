import { z } from "zod";

export const GetSignedDownloadUrlInput = z.object({ uuid: z.string() });

export const GetReaderUrlInput = z.object({
	uuid: z.string(),
	serverId: z.string(),
});

export const GetAudioFileDownloadUrlInput = z.object({
	uuid: z.string(),
	fileIndex: z.number().int().min(0),
});

export const GetSeriesDownloadUrlInput = z.object({
	seriesUuid: z.string().uuid(),
});

export const GetDirectoriesInput = z.object({ location: z.string() });
