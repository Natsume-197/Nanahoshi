import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
	path: "../../apps/server/.env",
});

export default defineConfig({
	schema: "./src/schema",
	out: "./src/migrations",
	dialect: "postgresql",
	dbCredentials: {
		host: process.env.DB_HOST || "",
		port: process.env.DB_PORT
			? Number.parseInt(process.env.DB_PORT)
			: undefined,
		user: process.env.DB_USER || "",
		password: process.env.DB_PASSWORD || "",
		database: process.env.DB_NAME || "",
	},
});
