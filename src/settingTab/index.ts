import { App, PluginSettingTab, Setting } from "obsidian";
import WikijsPublish from "src/main";

export class SettingTab extends PluginSettingTab {
	plugin: WikijsPublish;

	constructor(app: App, plugin: WikijsPublish) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		const document = containerEl.createEl("p", {
			text: `If you get stuck, please refer to `,
		});

		document.createEl("a", {
			attr: {
				href: "https://github.com/trinidz/obsidian-to-wikijs#usage",
			},
			text: "the documentation",
		});

		new Setting(containerEl)
			.setName("Wikijs URL")
			.setDesc(
				"The URL of your wikijs site. Make sure to include https:// at the beginning"
			)
			.addText((text) =>
				text
					.setPlaceholder("https://mywiki.mydomain.org")
					.setValue(this.plugin.settings.url)
					.onChange(async (value) => {
						this.plugin.settings.url = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("API Key")
			.setDesc("Your API Key")
			.addText((text) =>
				text
					.setPlaceholder("6251555c94ca6")
					.setValue(this.plugin.settings.adminToken)
					.onChange(async (value) => {
						this.plugin.settings.adminToken = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
