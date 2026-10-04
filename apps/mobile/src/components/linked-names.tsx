import { type Href, Link } from "expo-router";
import { Text } from "./text";

/** "De Ann Patchett, Someone Else": the prefix quiet, each name a link in
 * full ink. `quiet` is the narrator line under the authors. */
export function LinkedNames({
	people,
	hrefFor,
	prefix,
	quiet = false,
}: {
	people: { uuid: string; name: string }[];
	hrefFor?: (person: { uuid: string; name: string }) => Href;
	prefix?: string;
	quiet?: boolean;
}) {
	if (people.length === 0) return null;
	const variant = quiet ? "subhead" : "headline";
	const weight = quiet ? "500" : "600";
	return (
		<Text variant={variant} tone="secondary">
			{prefix ? `${prefix} ` : null}
			{people.map((person, index) => (
				<Text key={person.uuid} variant={variant} tone="secondary">
					{index > 0 ? ", " : ""}
					{hrefFor ? (
						<Link href={hrefFor(person)}>
							<Text variant={variant} style={{ fontWeight: weight }}>
								{person.name}
							</Text>
						</Link>
					) : (
						<Text variant={variant} style={{ fontWeight: weight }}>
							{person.name}
						</Text>
					)}
				</Text>
			))}
		</Text>
	);
}

/** The words around {names} in "By {names}", for languages that put it after. */
export function byPrefix(template: string) {
	return template.split("\u0000")[0]?.trim() ?? "";
}
