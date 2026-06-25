import { NotFoundError } from "../../errors";
import { orgProcedure } from "../../index";
import {
	cancelTask,
	clearFinishedTasks,
	deleteTask,
	getActiveTasks,
	getAllTasks,
	getTask,
	type Task,
	type TaskScope,
	taskVisibleTo,
} from "../../modules/taskManager";
import { TaskIdInput } from "./task.model";

/** Tasks are scoped to the caller's active server; app owners also see global tasks. */
function scopeFrom(context: {
	serverId: string;
	session: { user: { role?: string | null } };
}): TaskScope {
	return {
		serverId: context.serverId,
		isAppOwner: context.session.user.role === "admin",
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
		return await getActiveTasks(scopeFrom(context));
	}),

	getAllTasks: orgProcedure.handler(async ({ context }) => {
		return await getAllTasks(scopeFrom(context));
	}),

	getTask: orgProcedure
		.input(TaskIdInput)
		.handler(async ({ input, context }) => {
			const task = await getTask(input.taskId);
			return task && taskVisibleTo(task, scopeFrom(context)) ? task : null;
		}),

	cancelTask: orgProcedure
		.input(TaskIdInput)
		.handler(async ({ input, context }) => {
			await requireVisibleTask(input.taskId, scopeFrom(context));
			await cancelTask(input.taskId);
			return { success: true };
		}),

	deleteTask: orgProcedure
		.input(TaskIdInput)
		.handler(async ({ input, context }) => {
			await requireVisibleTask(input.taskId, scopeFrom(context));
			await deleteTask(input.taskId);
			return { success: true };
		}),

	clearFinished: orgProcedure.handler(async ({ context }) => {
		await clearFinishedTasks(scopeFrom(context));
		return { success: true };
	}),
};
