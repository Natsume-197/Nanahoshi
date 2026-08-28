import { describe, expect, test } from "bun:test";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { account } from "../schema/auth";

describe("Better Auth account schema", () => {
	test("scopes external identities by issuer and account id", () => {
		const columns = getTableColumns(account);
		expect(columns.issuer).toBeDefined();

		const config = getTableConfig(account);
		const identityIndex = config.indexes.find(
			(index) => index.config.name === "account_issuer_accountId_uidx",
		);

		expect(identityIndex?.config.unique).toBe(true);
	});
});
