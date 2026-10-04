import * as Haptics from "expo-haptics";
import { IS_ANDROID } from "./platform";

const android = (type: Haptics.AndroidHaptics) =>
	void Haptics.performAndroidHapticsAsync(type);

/**
 * The app's one vocabulary for touch feedback. Android plays the platform's
 * own haptic constants (tuned per device, off when the user disables touch
 * feedback); iOS the Taptic Engine. Keep it for moments that change
 * something — never on plain navigation.
 */
export const haptics = {
	/** A button that starts or stops something: play, a transport, download. */
	tap: () =>
		IS_ANDROID
			? android(Haptics.AndroidHaptics.Virtual_Key)
			: void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
	/** Picking one option among several: a tab, a chip, a shelf, a step. */
	select: () =>
		IS_ANDROID
			? android(Haptics.AndroidHaptics.Clock_Tick)
			: void Haptics.selectionAsync(),
	/** Opening a context menu on a long press. */
	longPress: () =>
		IS_ANDROID
			? android(Haptics.AndroidHaptics.Long_Press)
			: void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
	/** A drag that grabs something: scrubbing, pulling to refresh. */
	grab: () =>
		IS_ANDROID
			? android(Haptics.AndroidHaptics.Gesture_Start)
			: void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
	/** Letting go of that drag. */
	release: () =>
		IS_ANDROID
			? android(Haptics.AndroidHaptics.Gesture_End)
			: void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
	/** Something was made: a server, a library, an upload finished. */
	success: () =>
		IS_ANDROID
			? android(Haptics.AndroidHaptics.Confirm)
			: void Haptics.notificationAsync(
					Haptics.NotificationFeedbackType.Success,
				),
	/** Something failed. */
	error: () =>
		IS_ANDROID
			? android(Haptics.AndroidHaptics.Reject)
			: void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};
