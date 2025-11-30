import type { Plugin, App, TFile } from 'obsidian';
import type OpenSyncHistoryPlugin from './main';
import type { gHResult, item, syncInstance } from './interfaces';

export default class DiffUtils {
	plugin: OpenSyncHistoryPlugin;
	app: App;

	constructor(plugin: OpenSyncHistoryPlugin, app: App) {
		this.plugin = plugin;
		this.app = app;
	}

	private get instance(): syncInstance | null {
		return this.app.internalPlugins.plugins.sync?.instance ?? null;
	}

	async getVersions(
		file: TFile,
		uid: number | null = null
	): Promise<gHResult> {
		if (!this.instance) {
			throw new Error('Obsidian Sync is not enabled');
		}
		return await this.instance.getHistory(file.path, uid);
	}

	async getContent(uid: number): Promise<string> {
		if (!this.instance) {
			throw new Error('Obsidian Sync is not enabled');
		}
		const content = await this.instance.getContentForVersion(uid);
		const textDecoder = new TextDecoder('utf-8');
		const text = textDecoder.decode(new Uint8Array(content));
		return text;
	}
}
