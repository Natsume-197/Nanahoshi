import { checkFfprobeAvailable } from "@nanahoshi/api/modules/audioProbe";
import { checkEbookConvertAvailable } from "@nanahoshi/api/modules/calibre";
import { checkPsqlAvailable } from "@nanahoshi/api/modules/ranobedb/ranobedb.import";
import type { RuntimeInitializer } from "./types";

export const capabilitiesInitializer: RuntimeInitializer = {
	name: "capabilities",
	initialize: async () => {
		await checkEbookConvertAvailable();
		await checkFfprobeAvailable();
		await checkPsqlAvailable();
	},
};
