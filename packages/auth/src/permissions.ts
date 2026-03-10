import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";

const statement = {
	...defaultStatements,
	library: ["create", "update", "delete", "scan"] as const,
	book: ["read", "update", "delete", "download"] as const,
} as const;

export const ac = createAccessControl(statement);

export const member = ac.newRole({
	...memberAc.statements,
	library: [],
	book: ["read", "download"],
});

export const admin = ac.newRole({
	...adminAc.statements,
	library: ["create", "update", "delete", "scan"],
	book: ["read", "update", "delete", "download"],
});

export const owner = ac.newRole({
	...ownerAc.statements,
	library: ["create", "update", "delete", "scan"],
	book: ["read", "update", "delete", "download"],
});
