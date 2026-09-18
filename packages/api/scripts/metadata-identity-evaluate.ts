import { assessCatalogIdentity } from "../src/modules/catalogIdentity";
import { CATALOG_IDENTITY_REGRESSION_CORPUS } from "../src/modules/catalogIdentity/regression-corpus";

const rows = CATALOG_IDENTITY_REGRESSION_CORPUS.map((entry) => {
	const actual = assessCatalogIdentity(entry.left, entry.right).status;
	return { name: entry.name, expected: entry.expected, actual };
});
const correct = rows.filter((row) => row.actual === row.expected).length;
const falseAccepts = rows.filter(
	(row) => row.expected === "rejected" && row.actual === "confirmed",
);
const falseRejects = rows.filter(
	(row) => row.expected === "confirmed" && row.actual === "rejected",
);

console.table(rows);
console.log(
	JSON.stringify(
		{
			cases: rows.length,
			accuracy: rows.length ? correct / rows.length : 1,
			falseAccepts: falseAccepts.length,
			falseRejects: falseRejects.length,
		},
		null,
		2,
	),
);

if (correct !== rows.length) process.exitCode = 1;
