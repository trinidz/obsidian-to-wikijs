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
