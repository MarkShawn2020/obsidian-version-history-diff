import { Command, Notice, Plugin, TFile } from 'obsidian';
import type { OpenSyncHistorySettings } from './interfaces';
import OpenSyncHistorySettingTab from './settings';
import DiffUtils from './diff_utils';
import DiffView, { DiffType } from './abstract_diff_view';

const DEFAULT_SETTINGS: OpenSyncHistorySettings = {
	//context: '3',
	diffStyle: 'word',
	matchWordsThreshold: 0.25,
	colorBlind: false,
	outputFormat: 'line-by-line',
};

export default class OpenSyncHistoryPlugin extends Plugin {
	//@ts-ignore
	settings: OpenSyncHistorySettings;
	diff_utils = new DiffUtils(this, this.app);

	addCommand = (command: Command): Command => {
		const commandName = command.name;
		const newCommand = super.addCommand(command);
		newCommand.name = 'Version history diff: ' + commandName;
		return newCommand;
	};

	openDiffModal(file: TFile, type: DiffType = 'sync'): void {
		if (type === 'git' && !this.app.plugins.plugins['obsidian-git']) {
			new Notice('Obsidian Git is not enabled');
			return;
		}
		new DiffView(this, this.app, file, type).open();
	}

	giveCallback(
		fn: (file: TFile) => Promise<void> | void
	): Command['checkCallback'] {
		return (checking: boolean): boolean => {
			const tfile: TFile | null = this.app.workspace.getActiveFile();
			if (tfile) {
				if (!checking) {
					fn(tfile);
				}
				return true;
			} else {
				return false;
			}
		};
	}

	returnDiffCommand(): Command {
		return {
			id: 'open-sync-diff-view',
			name: 'Show Sync diff view for active file',
			checkCallback: this.giveCallback((file) =>
				this.openDiffModal(file, 'sync')
			),
		};
	}

	returnRecoveryDiffCommand(): Command {
		return {
			id: 'open-recovery-diff-view',
			name: 'Show File Recovery diff view for active file',
			checkCallback: this.giveCallback((file) =>
				this.openDiffModal(file, 'recovery')
			),
		};
	}

	returnGitDiffCommand(): Command {
		return {
			id: 'open-git-diff-view',
			name: 'Show Git Diff view for active file',
			checkCallback: this.giveCallback((file) =>
				this.openDiffModal(file, 'git')
			),
		};
	}

	async onload() {
		console.log('loading Version History Diff plugin');

		// if (this.app.internalPlugins.plugins.sync.enabled) {
		this.addCommand(this.returnDiffCommand());
		// }
		this.addCommand(this.returnRecoveryDiffCommand());
		// if (this.app.plugins.getPlugin('obsidian-git')) {
		this.addCommand(this.returnGitDiffCommand());
		// }

		// Register file-menu items
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile)) return;

				menu.addItem((item) => {
					item.setTitle('Version history diff')
						.setIcon('git-compare')
						.setSubmenu()
						.addItem((sub) => {
							sub.setTitle('File Recovery')
								.setIcon('archive-restore')
								.onClick(() => this.openDiffModal(file, 'recovery'));
						})
						.addItem((sub) => {
							sub.setTitle('Git')
								.setIcon('git-branch')
								.setDisabled(!this.app.plugins.plugins['obsidian-git'])
								.onClick(() => this.openDiffModal(file, 'git'));
						})
						.addItem((sub) => {
							sub.setTitle('Obsidian Sync')
								.setIcon('sync')
								.onClick(() => this.openDiffModal(file, 'sync'));
						});
				});
			})
		);

		await this.loadSettings();

		this.addSettingTab(new OpenSyncHistorySettingTab(this.app, this));
	}

	onunload() {
		console.log('unloading Version History Diff plugin');
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
