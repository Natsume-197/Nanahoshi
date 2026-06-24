import { checkFfprobeAvailable } from "@nanahoshi-v2/api/modules/audioProbe";
import { checkEbookConvertAvailable } from "@nanahoshi-v2/api/modules/conversion/converter";
import { checkPsqlAvailable } from "@nanahoshi-v2/api/modules/ranobedb/ranobedb.import";
import type { RuntimeInitializer } from "./types";

export const capabilitiesInitializer: RuntimeInitializer = {
	name: "capabilities",
	initialize: async () => {
		await checkEbookConvertAvailable();
		await checkFfprobeAvailable();
		await checkPsqlAvailable();
	},
};
