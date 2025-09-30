import { TAbstractFile } from "obsidian";


export interface SettingsProp {
	url: string;
	adminToken: string;
}

export const SettingsDefault: SettingsProp = {
	url: "",
	adminToken: "",
};

export interface DataProp {
	content: string;
}

/** Accepted Obsidian Image File Formats https://help.obsidian.md/file-formats
*/
export const VaultImageFileFormats = ["jpg", "jpeg", "png", "bmp", "svg", "avif", "gif", "webp"]

export interface VaultImageFileMetadata {
	abstractFile: TAbstractFile
	sha256: string
    ext: string
}