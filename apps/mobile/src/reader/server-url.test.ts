import { expect, test } from "bun:test";
import { onConnectedServer } from "./server-url";

test("a signed link from a host the phone cannot resolve goes to the connected address", () => {
	expect(
		onConnectedServer(
			"http://nanahoshi-dev.localhost:7333/read/b1?server=s1&exp=9&sig=abc",
			"http://192.168.1.25:7333",
		),
	).toBe("http://192.168.1.25:7333/read/b1?server=s1&exp=9&sig=abc");
});

test("a server behind a path prefix keeps the prefix", () => {
	expect(
		onConnectedServer(
			"https://books.example/read/b1?sig=abc",
			"https://home.example/nanahoshi/",
		),
	).toBe("https://home.example/nanahoshi/read/b1?sig=abc");
});
