import { protectedProcedure } from "../../index";
import {
	cancelTask,
	clearFinishedTasks,
	deleteTask,
	getActiveTasks,
	getAllTasks,
	getTask,
} from "../../modules/taskManager";
import { TaskIdInput } from "./task.model";

export const tasksRouter = {
	getActiveTasks: protectedProcedure.handler(async () => {
		return await getActiveTasks();
	}),

	getAllTasks: protectedProcedure.handler(async () => {
		return await getAllTasks();
	}),

	getTask: protectedProcedure.input(TaskIdInput).handler(async ({ input }) => {
		return await getTask(input.taskId);
	}),

	cancelTask: protectedProcedure
		.input(TaskIdInput)
		.handler(async ({ input }) => {
			await cancelTask(input.taskId);
			return { success: true };
		}),

	deleteTask: protectedProcedure
		.input(TaskIdInput)
		.handler(async ({ input }) => {
			await deleteTask(input.taskId);
			return { success: true };
		}),

	clearFinished: protectedProcedure.handler(async () => {
		await clearFinishedTasks();
		return { success: true };
	}),
};
