import { getUserPermissionContext } from "../../auth/access.repository";
import { NotFoundError } from "../../errors";
import { orgProcedure } from "../../index";
import {
	cancelTask,
	clearFinishedTasks,
	deleteTask,
	getActiveTasks,
	getAllTasks,
	getTask,
	getTaskPayload,
	type Task,
	type TaskScope,
	taskVisibleTo,
} from "../../modules/taskManager";
import { TaskIdInput } from "./task.model";

// Server owners/administrators see every task of their server; a regular
// member only sees (and acts on) tasks they initiated. App owners also get
// global tasks.
async function scopeFrom(context: {
	serverId: string;
	session: { user: { id: string; role?: string | null } };
}): Promise<TaskScope> {
	const isAppOwner = context.session.user.role === "admin";
	const pc = await getUserPermissionContext(
		context.session.user.id,
		context.serverId,
		{ isAppOwner },
	);
	return {
		serverId: context.serverId,
		isAppOwner,
		isServerAdmin: pc.isOrgOwner || pc.hasAdministrator,
		userId: context.session.user.id,
	};
}

/** Reject acting on a task that doesn't belong to the caller's server. */
async function requireVisibleTask(
	taskId: string,
	scope: TaskScope,
): Promise<Task> {
	const task = await getTask(taskId);
	if (!task || !taskVisibleTo(task, scope)) {
		throw new NotFoundError("Task not found");
	}
	return task;
}

export const tasksRouter = {
	getActiveTasks: orgProcedure.handler(async ({ context }) => {
		return await getActiveTasks(await scopeFrom(context));
	}),

	getAllTasks: orgProcedure.handler(async ({ context }) => {
		return await getAllTasks(await scopeFrom(context));
	}),

	getTask: orgProcedure
		.input(TaskIdInput)
		.handler(async ({ input, context }) => {
			const task = await getTask(input.taskId);
			return task && taskVisibleTo(task, await scopeFrom(context))
				? task
				: null;
		}),

	getPayload: orgProcedure
		.input(TaskIdInput)
		.handler(async ({ input, context }) => {
			await requireVisibleTask(input.taskId, await scopeFrom(context));
			return await getTaskPayload(input.taskId);
		}),

	cancelTask: orgProcedure
		.input(TaskIdInput)
		.handler(async ({ input, context }) => {
			await requireVisibleTask(input.taskId, await scopeFrom(context));
			await cancelTask(input.taskId);
			return { success: true };
		}),

	deleteTask: orgProcedure
		.input(TaskIdInput)
		.handler(async ({ input, context }) => {
			await requireVisibleTask(input.taskId, await scopeFrom(context));
			await deleteTask(input.taskId);
			return { success: true };
		}),

	clearFinished: orgProcedure.handler(async ({ context }) => {
		await clearFinishedTasks(await scopeFrom(context));
		return { success: true };
	}),
};
