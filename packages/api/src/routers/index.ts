import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { adminRouter } from "./admin";
import { audiobookShelfRouter } from "./audiobook-shelf";
import { audiobooksRouter } from "./audiobooks";
import { authorsRouter } from "./authors";
import { bookShelfRouter } from "./book-shelf";
import { booksRouter } from "./books";
import { collectionsRouter } from "./collections";
import { discordRulesRouter } from "./discord-rules";
import { filesRouter } from "./files";
import { followRouter } from "./follow";
import { genresRouter } from "./genres";
import { invitationsRouter } from "./invitations";
import { inviteLinksRouter } from "./invite-links";
import { kindleRouter } from "./kindle/kindle.router";
import { librariesRouter } from "./libraries";
import { libraryAccessRouter } from "./library-access";
import { likedBooksRouter } from "./liked-books";
import { listeningProgressRouter } from "./listening-progress";
import { membersRouter } from "./members";
import { narratorsRouter } from "./narrators";
import { notificationsRouter } from "./notifications";
import { opdsKeysRouter } from "./opds/opds.apikey.router";
import { profileRouter } from "./profile";
import { publishersRouter } from "./publishers";
import { readingProgressRouter } from "./reading-progress";
import { recommendationsRouter } from "./recommendations/recommendations.router";
import { rolesRouter } from "./roles";
import { searchRouter } from "./search";
import { seriesRouter } from "./series";
import { serverAccessRouter } from "./server-access";
import { serverProfileRouter } from "./server-profile/server-profile.router";
import { serverStatsRouter } from "./server-stats/server-stats.router";
import { settingsRouter } from "./settings/settings.router";
import { setupRouter } from "./setup.router";
import { tagsRouter } from "./tags";
import { tasksRouter } from "./tasks/task.router";
import { userSettingsRouter } from "./user-settings";
import { usersRouter } from "./users/users.router";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	privateData: protectedProcedure.handler(({ context }) => {
		return {
			message: "This is private",
			user: context.session?.user,
		};
	}),
	admin: adminRouter,
	audiobooks: audiobooksRouter,
	audiobookShelf: audiobookShelfRouter,
	authors: authorsRouter,
	books: booksRouter,
	collections: collectionsRouter,
	files: filesRouter,
	libraries: librariesRouter,
	listeningProgress: listeningProgressRouter,
	narrators: narratorsRouter,
	genres: genresRouter,
	tags: tagsRouter,
	publishers: publishersRouter,
	search: searchRouter,
	series: seriesRouter,
	settings: settingsRouter,
	serverAccess: serverAccessRouter,
	serverProfile: serverProfileRouter,
	serverStats: serverStatsRouter,
	setup: setupRouter,
	readingProgress: readingProgressRouter,
	bookShelf: bookShelfRouter,
	likedBooks: likedBooksRouter,
	profile: profileRouter,
	tasks: tasksRouter,
	invitations: invitationsRouter,
	inviteLinks: inviteLinksRouter,
	users: usersRouter,
	userSettings: userSettingsRouter,
	discordRules: discordRulesRouter,
	roles: rolesRouter,
	members: membersRouter,
	libraryAccess: libraryAccessRouter,
	follow: followRouter,
	notifications: notificationsRouter,
	kindle: kindleRouter,
	opdsKeys: opdsKeysRouter,
	recommendations: recommendationsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
