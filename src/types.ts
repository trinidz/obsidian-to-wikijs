export interface SettingsProp {
	url: string;
	adminToken: string;
}

export const DEFAULT_SETTINGS: SettingsProp = {
	url: "",
	adminToken: "",
};

export interface DataProp {
	content: string;
}

/** Accepted Obsidian Image File Formats https://help.obsidian.md/file-formats
*/
export const ImageFileFormats = ["jpg", "jpeg", "png", "bmp", "svg", "avif", "gif", "webp"]