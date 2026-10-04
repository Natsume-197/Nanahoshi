import { View } from "react-native";
import { DetailPanel, type DetailRow } from "@/components/detail-panel";
import { Text } from "@/components/text";
import type { ApiClient } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { t } from "@/lib/i18n";
import { space, usePalette } from "@/theme";
import { bookDate } from "./book-file-details";

export type AudiobookDetailData = Awaited<
	ReturnType<ApiClient["audiobooks"]["getDetails"]>
>;

/** Codec, files and dates: what the detail page used to keep in a tab. */
export function AudiobookTechnical({ data }: { data: AudiobookDetailData }) {
	const palette = usePalette();
	const technical: (DetailRow | null)[] = [
		data.codec
			? { label: t("audiobook.codec"), value: data.codec.toUpperCase() }
			: null,
		data.bitRate
			? {
					label: t("audiobook.bitrate"),
					value: `${Math.round(data.bitRate / 1000)} kbps`,
				}
			: null,
		data.sampleRate
			? {
					label: t("audiobook.sample_rate"),
					value: `${(data.sampleRate / 1000).toFixed(1)} kHz`,
				}
			: null,
		data.channels
			? {
					label: t("audiobook.channels"),
					value:
						data.channels === 1
							? t("audiobook.mono")
							: data.channels === 2
								? t("audiobook.stereo")
								: String(data.channels),
				}
			: null,
		{ label: t("audiobook.files"), value: String(data.audioFiles.length) },
		data.filesizeKb
			? {
					label: t("audiobook.size"),
					value: `${(data.filesizeKb / 1024).toFixed(0)} MB`,
				}
			: null,
	];
	return (
		<View style={{ gap: space.xxl }}>
			<DetailPanel title={t("audiobook.section_technical")} rows={technical} />
			<DetailPanel
				title={t("book.section_file_info")}
				rows={[
					{ label: t("book.filename"), value: data.filename },
					{ label: t("book.added"), value: bookDate(data.createdAt) },
					{ label: t("book.modified"), value: bookDate(data.lastModified) },
				]}
			/>
			{data.audioFiles.length > 0 ? (
				<View style={{ gap: space.sm }}>
					<Text variant="subhead" tone="secondary" accessibilityRole="header">
						{t("audiobook.files")}
					</Text>
					<View>
						{data.audioFiles.map((file, index) => (
							<View
								key={file.index}
								style={{
									flexDirection: "row",
									gap: space.md,
									paddingVertical: space.md,
									borderTopWidth: index === 0 ? 0 : 1,
									borderColor: palette.separator,
								}}
							>
								<Text
									variant="caption"
									tone="tertiary"
									style={{ width: 20, fontVariant: ["tabular-nums"] }}
								>
									{file.index + 1}
								</Text>
								<View style={{ flex: 1, gap: 2 }}>
									<Text variant="subhead" selectable>
										{file.filename}
									</Text>
									<Text variant="caption" tone="secondary">
										{[
											formatDuration(file.duration),
											file.filesize == null
												? null
												: `${(file.filesize / 1024 / 1024).toFixed(1)} MB`,
										]
											.filter(Boolean)
											.join(" · ")}
									</Text>
								</View>
							</View>
						))}
					</View>
				</View>
			) : null}
		</View>
	);
}
