import { createTwoFilesPatch } from 'diff';
import { Diff2HtmlConfig, html } from 'diff2html';
import { App, Modal, setTooltip, TFile } from 'obsidian';
import { FILE_REC_WARNING, GIT_WARNING, ITEM_CLASS, SYNC_WARNING } from './constants';
import FileModal from './file_modal';
import type {
	DefaultLogFields,
	gHResult,
	recResult,
	vGitItem,
	vItem,
	vRecoveryItem,
	vSyncItem,
} from './interfaces';
import type OpenSyncHistoryPlugin from './main';

export type DiffType = 'sync' | 'recovery' | 'git';

function getSize(size: number): string {
	if (size === 0) {
		return '0';
	} else {
		return (size / 1000).toString().slice(0, -1);
	}
}

export default class DiffView extends Modal {
	plugin: OpenSyncHistoryPlugin;
	app: App;
	file: TFile;
	leftVList: vItem[];
	rightVList: vItem[];
	leftActive: number;
	rightActive: number;
	rightContent: string;
	leftContent: string;
	syncHistoryContentContainer: HTMLElement;
	leftHistory: HTMLElement[];
	rightHistory: HTMLElement[];
	htmlConfig: Diff2HtmlConfig;
	ids: { left: number; right: number };
	focusedSide: 'left' | 'right';
	keydownHandler: (e: KeyboardEvent) => void;

	// Unified diff type support
	currentType: DiffType;
	switcherEl: HTMLElement;

	// Type-specific data
	syncVersions: gHResult;
	recoveryVersions: recResult[];
	gitVersions: DefaultLogFields[];

	// Load more buttons (for sync)
	leftMoreButton: HTMLDivElement | null = null;
	rightMoreButton: HTMLDivElement | null = null;

	constructor(
		plugin: OpenSyncHistoryPlugin,
		app: App,
		file: TFile,
		initialType: DiffType = 'sync'
	) {
		super(app);
		this.plugin = plugin;
		this.app = app;
		this.file = file;
		this.currentType = initialType;
		this.modalEl.addClasses(['mod-sync-history', 'diff']);
		this.leftVList = [];
		this.rightVList = [];
		this.rightActive = 0;
		this.leftActive = 1;
		this.rightContent = '';
		this.leftContent = '';
		this.ids = { left: 0, right: 0 };
		this.focusedSide = 'left';
		//@ts-expect-error, will be filled with the correct data later
		this.leftHistory = [null];
		//@ts-expect-error, will be filled with the correct data later
		this.rightHistory = [null];
		this.keydownHandler = this.handleKeydown.bind(this);
		this.htmlConfig = {
			diffStyle: this.plugin.settings.diffStyle,
			matchWordsThreshold: this.plugin.settings.matchWordsThreshold,
			outputFormat: this.plugin.settings.outputFormat,
		};
		this.containerEl.addClass('diff');
		// @ts-ignore
		this.syncHistoryContentContainer = this.contentEl.createDiv({
			cls: ['sync-history-content-container', 'diff'],
		});
		if (this.plugin.settings.colorBlind) {
			this.syncHistoryContentContainer.addClass('colorblind');
		}

		// Initialize type-specific data
		//@ts-expect-error
		this.syncVersions = {};
		this.recoveryVersions = [];
		this.gitVersions = [];
	}

	async onOpen() {
		super.onOpen();
		document.addEventListener('keydown', this.keydownHandler);
		const success = await this.loadCurrentType();
		if (success === false) {
			this.showErrorGuide();
		}
	}

	onClose() {
		super.onClose();
		document.removeEventListener('keydown', this.keydownHandler);
	}

	private handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			this.focusedSide = 'left';
			this.updateFocusIndicator();
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			this.focusedSide = 'right';
			this.updateFocusIndicator();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			this.navigateVersion(-1);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			this.navigateVersion(1);
		}
	}

	private updateFocusIndicator() {
		this.leftHistory[0]?.removeClass('is-focused');
		this.rightHistory[0]?.removeClass('is-focused');
		if (this.focusedSide === 'left') {
			this.leftHistory[0]?.addClass('is-focused');
		} else {
			this.rightHistory[0]?.addClass('is-focused');
		}
	}

	private navigateVersion(delta: number) {
		const isLeft = this.focusedSide === 'left';
		const vList = isLeft ? this.leftVList : this.rightVList;
		const currentActive = isLeft ? this.leftActive : this.rightActive;
		const newIndex = currentActive + delta;

		if (newIndex < 0 || newIndex >= vList.length) {
			return;
		}

		const targetItem = vList[newIndex];
		targetItem.html.click();
		targetItem.html.scrollIntoView({ block: 'nearest' });
	}

	// ========== Unified Type Switching ==========

	private async loadCurrentType(): Promise<void | boolean> {
		const success = await this.initializeVersions();
		if (success === false) return false;

		const diff = this.getDiff();
		this.makeHistoryLists(this.getWarning());
		if (this.currentType === 'sync') {
			this.makeSyncButtons();
		}
		this.basicHtml(diff, this.getTitle());
		this.appendVersions();
		this.makeMoreGeneralHtml();
	}

	async switchTo(type: DiffType): Promise<void> {
		if (type === this.currentType) return;

		this.currentType = type;
		await this.reset();
		const success = await this.loadCurrentType();
		if (success === false) {
			this.showErrorGuide();
		}
		this.updateSwitcherActive();
	}

	private showErrorGuide(): void {
		// Create switcher so user can switch to other types
		this.createSwitcher();

		const guideEl = this.contentEl.createDiv({ cls: 'diff-error-guide' });

		const icon = guideEl.createDiv({ cls: 'diff-error-icon' });
		icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

		const title = guideEl.createDiv({ cls: 'diff-error-title' });
		const desc = guideEl.createDiv({ cls: 'diff-error-desc' });

		switch (this.currentType) {
			case 'sync':
				title.setText('Obsidian Sync not available');
				desc.innerHTML = `
					<p>To use Sync version history:</p>
					<ol>
						<li>Enable <strong>Sync</strong> in Settings → Core plugins</li>
						<li>Set up and connect to your sync vault</li>
						<li>Make sure this file has been synced</li>
					</ol>
				`;
				break;
			case 'git':
				title.setText('Git not available');
				desc.innerHTML = `
					<p>To use Git version history:</p>
					<ol>
						<li>Install the <strong>Obsidian Git</strong> community plugin</li>
						<li>Initialize a git repository in your vault</li>
						<li>Commit changes to create version history</li>
					</ol>
				`;
				break;
			case 'recovery':
				title.setText('No recovery snapshots');
				desc.innerHTML = `
					<p>File Recovery saves periodic snapshots of your files.</p>
					<ol>
						<li>Enable <strong>File Recovery</strong> in Settings → Core plugins</li>
						<li>Edit and save the file to create snapshots</li>
					</ol>
				`;
				break;
		}
	}

	private async reset(): Promise<void> {
		// Clear DOM
		this.contentEl.empty();

		// Recreate content container
		// @ts-ignore
		this.syncHistoryContentContainer = this.contentEl.createDiv({
			cls: ['sync-history-content-container', 'diff'],
		});
		if (this.plugin.settings.colorBlind) {
			this.syncHistoryContentContainer.addClass('colorblind');
		}

		// Reset state
		this.leftVList = [];
		this.rightVList = [];
		this.leftActive = 1;
		this.rightActive = 0;
		this.leftContent = '';
		this.rightContent = '';
		this.ids = { left: 0, right: 0 };
		//@ts-expect-error
		this.leftHistory = [null];
		//@ts-expect-error
		this.rightHistory = [null];
		this.leftMoreButton = null;
		this.rightMoreButton = null;

		// Reset type-specific data
		//@ts-expect-error
		this.syncVersions = {};
		this.recoveryVersions = [];
		this.gitVersions = [];
	}

	private getWarning(): string {
		switch (this.currentType) {
			case 'sync':
				return SYNC_WARNING;
			case 'recovery':
				return FILE_REC_WARNING;
			case 'git':
				return GIT_WARNING;
		}
	}

	private getTitle(): string {
		switch (this.currentType) {
			case 'sync':
				return 'Sync Diff';
			case 'recovery':
				return 'File Recovery Diff';
			case 'git':
				return 'Git Diff';
		}
	}

	// ========== Version Initialization (by type) ==========

	private async initializeVersions(): Promise<void | boolean> {
		switch (this.currentType) {
			case 'sync':
				return this.initSyncVersions();
			case 'recovery':
				return this.initRecoveryVersions();
			case 'git':
				return this.initGitVersions();
		}
	}

	private async initSyncVersions(): Promise<void | boolean> {
		try {
			this.syncVersions = await this.plugin.diff_utils.getVersions(this.file);
		} catch (e) {
			return false;
		}
		let [latestV, secondLatestV] = [0, 0];
		if (this.syncVersions.items.length > 1) {
			latestV = this.syncVersions.items[0].uid;
			secondLatestV = this.syncVersions.items[1].uid;
		} else {
			return false;
		}

		const getContent = this.plugin.diff_utils.getContent.bind(this.plugin.diff_utils);
		[this.leftContent, this.rightContent] = [
			await getContent(secondLatestV),
			await getContent(latestV),
		];
	}

	private async initRecoveryVersions(): Promise<void | boolean> {
		const fileRecovery = await this.app.internalPlugins.plugins[
			'file-recovery'
		].instance.db
			.transaction('backups', 'readonly')
			.store.index('path')
			.getAll();
		const fileContent = await this.app.vault.read(this.file);
		this.recoveryVersions.push({
			path: this.file.path,
			ts: 0,
			data: fileContent,
		});
		const len = fileRecovery.length - 1;
		for (let i = len; i >= 0; i--) {
			const version = fileRecovery[i];
			if (version.path === this.file.path) {
				this.recoveryVersions.push(version);
			}
		}
		if (!(this.recoveryVersions.length > 1)) {
			return false;
		}

		[this.leftContent, this.rightContent] = [
			this.recoveryVersions[1].data,
			this.recoveryVersions[0].data,
		];
	}

	private async initGitVersions(): Promise<void | boolean> {
		const { gitManager } = this.app.plugins.plugins['obsidian-git'];
		const gitVersions = await gitManager.log(this.file.path);
		if (gitVersions.length === 0) {
			return false;
		}
		this.gitVersions.push({
			author_email: '',
			author_name: '',
			body: '',
			date: new Date().toLocaleTimeString(),
			hash: '',
			message: '',
			refs: '',
			fileName: this.file.name,
		});
		this.gitVersions.push(...gitVersions);
		const diskContent = await this.app.vault.read(this.file);
		const latestCommit = await gitManager.show(
			this.gitVersions[1].hash,
			this.file.path
		);
		[this.leftContent, this.rightContent] = [latestCommit, diskContent];
	}

	// ========== Version Appending (by type) ==========

	private appendVersions(): void {
		switch (this.currentType) {
			case 'sync':
				this.leftVList.push(
					...this.appendSyncVersions(
						this.leftHistory[1],
						this.syncVersions,
						true
					)
				);
				this.rightVList.push(
					...this.appendSyncVersions(
						this.rightHistory[1],
						this.syncVersions,
						false
					)
				);
				break;
			case 'recovery':
				this.leftVList.push(
					...this.appendRecoveryVersions(
						this.leftHistory[1],
						this.recoveryVersions,
						true
					)
				);
				this.rightVList.push(
					...this.appendRecoveryVersions(
						this.rightHistory[1],
						this.recoveryVersions,
						false
					)
				);
				break;
			case 'git':
				this.leftVList.push(
					...this.appendGitVersions(
						this.leftHistory[1],
						this.gitVersions,
						true
					)
				);
				this.rightVList.push(
					...this.appendGitVersions(
						this.rightHistory[1],
						this.gitVersions,
						false
					)
				);
				break;
		}
	}

	// ========== Sync-specific methods ==========

	private appendSyncVersions(
		el: HTMLElement,
		versions: gHResult,
		left: boolean
	): vSyncItem[] {
		const versionList: vSyncItem[] = [];
		for (let i = 0; i <= versions.items.length - 1; i++) {
			let version = versions.items[i];
			const date = new Date(version.ts);
			const div = el.createDiv({
				cls: ITEM_CLASS,
				text: date.toDateString() + ', ' + date.toLocaleTimeString(),
				attr: {
					id: left ? this.ids.left : this.ids.right,
				},
			});
			left ? (this.ids.left += 1) : (this.ids.right += 1);
			const infoDiv = div.createDiv({
				cls: ['u-muted'],
				text: getSize(version.size) + ' KB [' + version.device + ']',
			});
			versionList.push({
				html: div,
				v: version,
			});
			div.addEventListener('click', async () => {
				if (left) {
					const clickedEl = (await this.generateVersionListener(
						div,
						this.leftVList,
						this.leftActive,
						left
					)) as vSyncItem;
					await this.getSyncContent(clickedEl, left);
					this.syncHistoryContentContainer.innerHTML = this.getDiff();
				} else {
					const clickedEl = (await this.generateVersionListener(
						div,
						this.rightVList,
						this.rightActive
					)) as vSyncItem;
					await this.getSyncContent(clickedEl);
					this.syncHistoryContentContainer.innerHTML = this.getDiff();
				}
			});
		}
		return versionList;
	}

	private async getSyncContent(
		clickedEl: vSyncItem,
		left: boolean = false
	): Promise<void> {
		const getContent = this.plugin.diff_utils.getContent.bind(this.plugin.diff_utils);
		if (left) {
			this.leftContent = await getContent(clickedEl.v.uid);
		} else {
			this.rightContent = await getContent(clickedEl.v.uid);
		}
	}

	private makeSyncButtons(): void {
		this.leftMoreButton = this.leftHistory[0].createDiv({
			cls: ['sync-history-load-more-button', 'diff'],
			text: 'Load more',
		});
		this.rightMoreButton = this.rightHistory[0].createDiv({
			cls: ['sync-history-load-more-button', 'diff'],
			text: 'Load more',
		});
		this.setMoreButtonStyle();

		for (const el of [this.leftMoreButton, this.rightMoreButton]) {
			el.addEventListener('click', async () => {
				const newVersions = await this.plugin.diff_utils.getVersions(
					this.file,
					this.syncVersions.items.last()?.uid
				);
				this.syncVersions.more = newVersions.more;
				this.setMoreButtonStyle();

				this.leftVList.push(
					...this.appendSyncVersions(
						this.leftHistory[1],
						newVersions,
						true
					)
				);
				this.rightVList.push(
					...this.appendSyncVersions(
						this.rightHistory[1],
						newVersions,
						false
					)
				);
				this.syncVersions.items.push(...newVersions.items);
			});
		}
	}

	private setMoreButtonStyle(): void {
		if (!this.leftMoreButton || !this.rightMoreButton) return;
		if (this.syncVersions.more) {
			this.leftMoreButton.style.display = 'block';
			this.rightMoreButton.style.display = 'block';
		} else {
			this.leftMoreButton.style.display = 'none';
			this.rightMoreButton.style.display = 'none';
		}
	}

	// ========== Recovery-specific methods ==========

	private appendRecoveryVersions(
		el: HTMLElement,
		versions: recResult[],
		left: boolean = false
	): vRecoveryItem[] {
		const versionList: vRecoveryItem[] = [];
		for (let i = 0; i < versions.length; i++) {
			const version = versions[i];
			let date = new Date(version.ts);
			if (i === 0) {
				date = new Date();
			}
			let div = el.createDiv({
				cls: ITEM_CLASS,
				attr: {
					id: left ? this.ids.left : this.ids.right,
				},
			});
			left ? (this.ids.left += 1) : (this.ids.right += 1);
			if (i === 0) {
				div.createDiv({ text: 'State on disk' });
				div.createDiv({ text: date.toLocaleTimeString() });
			} else {
				div.createDiv({
					text: date.toDateString() + ', ' + date.toLocaleTimeString(),
				});
			}
			versionList.push({
				html: div,
				data: version.data,
			});
			div.addEventListener('click', async () => {
				if (left) {
					const clickedEl = (await this.generateVersionListener(
						div,
						this.leftVList,
						this.leftActive,
						left
					)) as vRecoveryItem;
					this.leftContent = version.data;
					this.syncHistoryContentContainer.innerHTML = this.getDiff();
				} else {
					const clickedEl = (await this.generateVersionListener(
						div,
						this.rightVList,
						this.rightActive
					)) as vRecoveryItem;
					this.rightContent = version.data;
					this.syncHistoryContentContainer.innerHTML = this.getDiff();
				}
			});
		}
		return versionList;
	}

	// ========== Git-specific methods ==========

	private appendGitVersions(
		el: HTMLElement,
		versions: DefaultLogFields[],
		left: boolean = false
	): vGitItem[] {
		const versionList: vGitItem[] = [];
		for (let i = 0; i < versions.length; i++) {
			const version = versions[i];
			const div = el.createDiv({
				cls: ITEM_CLASS,
				attr: {
					id: left ? this.ids.left : this.ids.right,
				},
			});
			left ? (this.ids.left += 1) : (this.ids.right += 1);
			const message = div.createDiv({
				text: i !== 0 ? version.message : 'State on disk',
			});
			setTooltip(message, version.body !== '' ? version.body : '', {
				placement: 'top',
			});
			const infoDiv = div.createDiv({
				cls: ['u-muted'],
			});
			if (version.fileName !== this.file.path && i !== 0) {
				const changedName = infoDiv.createDiv({
					text: 'Old name: ' + version.fileName.slice(0, -3),
				});
			}
			const date = infoDiv.createDiv({
				text: version.date.split('T')[0],
			});
			const time = infoDiv.createDiv({
				text: version.date.split('T')[1],
			});
			const author = infoDiv.createDiv({
				text: version.author_name,
			});
			const hash = infoDiv.createDiv({
				text: version.hash.slice(0, 7),
			});
			let refs;
			const refsText = version.refs;
			if (refsText !== '') {
				refs = infoDiv.createDiv({
					text: refsText,
				});
			}

			hash.style.cursor = 'copy';
			hash.addEventListener('click', async (mod) => {
				mod.stopPropagation();
				if (mod.shiftKey) {
					navigator.clipboard.writeText(version.hash);
				} else {
					await navigator.clipboard.writeText(version.hash.slice(0, 7));
				}
			});
			versionList.push({
				html: div,
				v: version,
			});
			div.addEventListener('click', async () => {
				if (left) {
					const clickedEl = (await this.generateVersionListener(
						div,
						this.leftVList,
						this.leftActive,
						left
					)) as vGitItem;
					if (this.leftActive === 0) {
						this.leftContent = await this.app.vault.read(this.file);
					} else {
						this.leftContent = await this.app.plugins.plugins[
							'obsidian-git'
						].gitManager.show(clickedEl.v.hash, clickedEl.v.fileName);
					}
					this.syncHistoryContentContainer.innerHTML = this.getDiff();
				} else {
					const clickedEl = (await this.generateVersionListener(
						div,
						this.rightVList,
						this.rightActive
					)) as vGitItem;
					if (this.rightActive === 0) {
						this.rightContent = await this.app.vault.read(this.file);
					} else {
						this.rightContent = await this.app.plugins.plugins[
							'obsidian-git'
						].gitManager.show(clickedEl.v.hash, clickedEl.v.fileName);
					}
					this.syncHistoryContentContainer.innerHTML = this.getDiff();
				}
			});
		}

		return versionList;
	}

	// ========== Common methods ==========

	public getDiff(): string {
		const uDiff = createTwoFilesPatch(
			this.file.basename,
			this.file.basename,
			this.leftContent,
			this.rightContent
		);
		const diff = html(uDiff, this.htmlConfig);
		return diff;
	}

	public makeHistoryLists(warning: string): void {
		this.leftHistory = this.createHistory(this.contentEl, true, warning);
		this.rightHistory = this.createHistory(this.contentEl, false, warning);
	}

	private createHistory(
		el: HTMLElement,
		left: boolean = false,
		warning: string
	): HTMLElement[] {
		const syncHistoryListContainer = el.createDiv({
			cls: 'sync-history-list-container',
		});
		if (left) {
			const showFile = syncHistoryListContainer.createEl('button', {
				cls: 'mod-cta',
				text: 'Render this version',
			});
			showFile.addEventListener('click', () => {
				new FileModal(
					this.plugin,
					this.app,
					this.leftContent,
					this.file,
					warning
				).open();
			});
		}
		const syncHistoryList = syncHistoryListContainer.createDiv({
			cls: 'sync-history-list',
		});
		return [syncHistoryListContainer, syncHistoryList];
	}

	public basicHtml(diff: string, diffType: string): void {
		// Create switcher in title area
		this.createSwitcher();

		// add diff to container
		this.syncHistoryContentContainer.innerHTML = diff;

		// add history lists and diff to DOM
		this.contentEl.appendChild(this.leftHistory[0]);
		this.contentEl.appendChild(this.syncHistoryContentContainer);
		this.contentEl.appendChild(this.rightHistory[0]);
	}

	private createSwitcher(): void {
		// Clear existing title content and create container
		this.titleEl.empty();

		const titleContainer = this.titleEl.createDiv({
			cls: 'diff-title-container',
		});

		// Title text
		titleContainer.createSpan({
			text: this.file.basename,
			cls: 'diff-title-text',
		});

		// Switcher buttons
		this.switcherEl = titleContainer.createDiv({
			cls: 'diff-type-switcher',
		});

		const types: { type: DiffType; label: string }[] = [
			{ type: 'recovery', label: 'Recovery' },
			{ type: 'git', label: 'Git' },
			{ type: 'sync', label: 'Sync' },
		];

		for (const { type, label } of types) {
			const btn = this.switcherEl.createEl('button', {
				text: label,
				cls: 'diff-type-btn',
			});
			if (type === this.currentType) {
				btn.addClass('is-active');
			}
			// Disable if not available
			if (type === 'git' && !this.app.plugins.plugins['obsidian-git']) {
				btn.addClass('is-disabled');
				btn.setAttribute('disabled', 'true');
			}
			if (type === 'sync' && !this.app.internalPlugins.plugins.sync?.instance) {
				btn.addClass('is-disabled');
				btn.setAttribute('disabled', 'true');
			}
			btn.addEventListener('click', () => this.switchTo(type));
		}
	}

	private updateSwitcherActive(): void {
		if (!this.switcherEl) return;
		const buttons = this.switcherEl.querySelectorAll('.diff-type-btn');
		buttons.forEach((btn) => {
			btn.removeClass('is-active');
			if (btn.textContent?.toLowerCase() === this.currentType) {
				btn.addClass('is-active');
			}
		});
	}

	public makeMoreGeneralHtml(): void {
		// highlight initial two versions
		this.rightVList[0].html.addClass('is-active');
		this.leftVList[1].html.addClass('is-active');
		// keep track of highlighted versions
		this.rightActive = 0;
		this.leftActive = 1;
		// init focus indicator
		this.updateFocusIndicator();
	}

	public async generateVersionListener(
		div: HTMLDivElement,
		currentVList: vItem[],
		currentActive: number,
		left: boolean = false
	): Promise<vItem> {
		const currentSideOldVersion = currentVList[currentActive];
		const idx = Number(div.id);
		const clickedEl: vItem = currentVList[idx];
		div.addClass('is-active');
		if (left) {
			this.leftActive = idx;
		} else {
			this.rightActive = idx;
		}
		if (Number.parseInt(currentSideOldVersion.html.id) !== idx) {
			currentSideOldVersion.html.classList.remove('is-active');
		}
		return clickedEl;
	}
}
