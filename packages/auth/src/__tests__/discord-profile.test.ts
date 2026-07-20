import { describe, expect, test } from "bun:test";
import { mapDiscordProfileToUser } from "../discord-profile";

describe("mapDiscordProfileToUser", () => {
	test("keeps a modern unique Discord username clean", () => {
		const mapped = mapDiscordProfileToUser({
			id: "1234567890123456789",
			username: "Natsume.197",
			global_name: "Natsume",
			discriminator: "0",
		});

		expect(mapped.username).toBe("natsume.197");
		expect(mapped.username.length).toBeLessThanOrEqual(30);
		expect(mapped.username).toMatch(/^[a-zA-Z0-9_.]{3,30}$/);
		expect(mapped.displayUsername).toBe("Natsume");
	});

	test("adds the discriminator only for a legacy Discord username", () => {
		const mapped = mapDiscordProfileToUser({
			id: "987654321",
			username: "Nelly",
			global_name: null,
			discriminator: "1337",
		});

		expect(mapped.username).toBe("nelly_1337");
		expect(mapped.displayUsername).toBe("Nelly");
	});

	test("uses a short id fallback only when sanitizing leaves no username", () => {
		const mapped = mapDiscordProfileToUser({
			id: "1234567890123456789",
			username: "猫 !",
			global_name: "猫",
			discriminator: "0",
		});

		expect(mapped.username).toBe("user_23456789");
		expect(mapped.displayUsername).toBe("猫");
	});
});
