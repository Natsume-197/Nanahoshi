import { describe, expect, test } from "bun:test";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { account } from "../schema/auth";

describe("Better Auth account schema", () => {
	test("allows Better Auth to create accounts without the legacy issuer", () => {
		const columns = getTableColumns(account);
		expect(columns.issuer.notNull).toBe(false);

		const config = getTableConfig(account);
		const identityIndex = config.indexes.find(
			(index) => index.config.name === "account_issuer_accountId_uidx",
		);

		expect(identityIndex).toBeUndefined();
	});
});
