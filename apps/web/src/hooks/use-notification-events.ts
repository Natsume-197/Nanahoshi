import { CONTENT_TASK_TYPES } from "@nanahoshi-v2/api/modules/tasks/task-registry";
import type { NotificationPushEvent } from "@nanahoshi-v2/api/routers/notifications/notification.events";
import type { NotificationData } from "@nanahoshi-v2/api/routers/notifications/notification.model";
import { useGatewayChannel } from "@/lib/gateway/use-gateway-channel";
import { orpc, queryClient } from "@/utils/orpc";

const unreadCountKey = orpc.notifications.unreadCount.queryOptions().queryKey;
const listKey = orpc.notifications.list.key();

/**
 * Live notification events over the gateway WebSocket. Keeps the unread badge
 * current even with the bell panel closed, and converges every tab of the
 * same user on read/delete (the acting tab already updated via onSuccess; the
 * duplicate invalidation is harmless). On (re)connect both queries re-sync,
 * covering anything missed while disconnected.
 */
export function useNotificationEvents() {
	useGatewayChannel(
		"notifications",
		(data) => {
			const event = data as NotificationPushEvent;
			if (event.kind === "new") {
				queryClient.setQueryData<{ count: number }>(unreadCountKey, (old) => ({
					count: (old?.count ?? 0) + 1,
				}));
				queryClient.invalidateQueries({ queryKey: listKey });
				// Regular members don't receive other people's task events (tasks
				// are visibility-scoped), so a "library updated" notification is
				// their signal that new content exists — refetch everything once.
				const payload = event.notification.payload as NotificationData;
				if (
					payload.type === "task_finished" &&
					CONTENT_TASK_TYPES.has(payload.taskType)
				) {
					queryClient.invalidateQueries();
				}
				return;
			}
			if (event.kind === "read_all") {
				queryClient.setQueryData(unreadCountKey, { count: 0 });
				queryClient.invalidateQueries({ queryKey: listKey });
				return;
			}
			// read / delete: the exact unread delta is unknown here
			// (some ids may already be read), so refetch both.
			queryClient.invalidateQueries({ queryKey: unreadCountKey });
			queryClient.invalidateQueries({ queryKey: listKey });
		},
		() => {
			queryClient.invalidateQueries({ queryKey: unreadCountKey });
			queryClient.invalidateQueries({ queryKey: listKey });
		},
	);
}
