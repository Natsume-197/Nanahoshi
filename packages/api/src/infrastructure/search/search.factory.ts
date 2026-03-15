import { env } from "@nanahoshi-v2/env/server";
import type { SearchProvider } from "./search.provider";

let _searchProvider: SearchProvider | undefined;

export function getSearchProvider(): SearchProvider {
	if (_searchProvider) return _searchProvider;

	if (env.SEARCH_PROVIDER === "elasticsearch") {
		const { ElasticsearchProvider } =
			require("./elasticsearch/elasticsearch.provider") as typeof import("./elasticsearch/elasticsearch.provider");
		_searchProvider = new ElasticsearchProvider();
	} else {
		const { PGroongaProvider } =
			require("./pgroonga/pgroonga.provider") as typeof import("./pgroonga/pgroonga.provider");
		_searchProvider = new PGroongaProvider();
	}

	return _searchProvider;
}
