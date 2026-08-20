import { db } from "@nanahoshi-v2/db";
import { downloadDeliveryEvent } from "@nanahoshi-v2/db/schema/general";
import { logger } from "../../lib/logger";
import {
	type DownloadDeliveryInput,
	toDownloadDeliveryRow,
} from "./download-delivery.model";
import { publishInstanceActivity } from "./playback.manager";

export type { DownloadDeliveryInput } from "./download-delivery.model";

const log = logger.child({ component: "download-delivery" });

/** Best-effort history: losing telemetry must never interrupt file delivery. */
export async function recordDownloadDeliveryEvent(
	input: DownloadDeliveryInput,
): Promise<void> {
	try {
		await db.insert(downloadDeliveryEvent).values(toDownloadDeliveryRow(input));
		publishInstanceActivity({ kind: "download_changed" });
	} catch (err) {
		log.error(
			{
				err,
				deliveryKind: input.deliveryKind,
				userId: input.user.id,
				itemUuid: input.item.uuid,
			},
			"Failed to record download delivery",
		);
	}
}
