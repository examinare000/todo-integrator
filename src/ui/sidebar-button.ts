import { App, setIcon, Component } from 'obsidian';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';

export class SidebarButton extends Component {
	private app: App;
	private logger: Logger;
	private errorHandler: ErrorHandler;
	private containerEl: HTMLElement;
	private syncCallback: () => Promise<void>;
	private statusEl: HTMLElement;
	private buttonEl: HTMLButtonElement;
	private isSync: boolean = false;

	constructor(
		app: App,
		logger: Logger,
		errorHandler: ErrorHandler,
		syncCallback: () => Promise<void>
	) {
		super();
		this.app = app;
		this.logger = logger;
		this.errorHandler = errorHandler;
		this.syncCallback = syncCallback;
	}

	createSyncButton(parent: HTMLElement): HTMLElement {
		this.containerEl = parent.createDiv('todo-sync-container');
		
		// Create sync button
		this.buttonEl = this.containerEl.createEl('button', {
			cls: 'todo-sync-button',
			attr: { 'aria-label': 'Sync ToDo with Microsoft Todo' }
		});

		// Add icon
		const iconEl = this.buttonEl.createSpan('sync-icon');
		setIcon(iconEl, 'sync');

		// Add text
		this.buttonEl.createSpan('sync-text', { text: 'Sync ToDo' });

		// Add status indicator
		this.statusEl = this.containerEl.createDiv('sync-status');
		this.updateSyncStatus('idle');

		// Add click handler
		this.buttonEl.addEventListener('click', this.onSyncButtonClick.bind(this));

		this.logger.debug('Sync button created in sidebar');
		return this.containerEl;
	}

	async onSyncButtonClick(): Promise<void> {
		if (this.isSync) {
			this.logger.debug('Sync already in progress, ignoring click');
			return;
		}

		try {
			this.logger.info('Manual sync initiated from sidebar button');
			this.showSyncProgress();
			
			await this.syncCallback();
			
			this.updateSyncStatus('success');
			
			// Reset to idle after 3 seconds
			setTimeout(() => {
				this.updateSyncStatus('idle');
			}, 3000);
			
		} catch (error) {
			this.logger.error('Manual sync failed', error);
			const errorMessage = this.errorHandler.handleApiError(error);
			this.updateSyncStatus('error', errorMessage);
			
			// Reset to idle after 5 seconds
			setTimeout(() => {
				this.updateSyncStatus('idle');
			}, 5000);
		}
	}

	updateSyncStatus(status: 'idle' | 'syncing' | 'success' | 'error', message?: string): void {
		this.statusEl.empty();
		this.statusEl.className = `sync-status sync-status-${status}`;

		let statusText = '';
		let iconName = '';

		switch (status) {
			case 'idle':
				statusText = 'Ready';
				iconName = 'circle';
				this.isSync = false;
				this.buttonEl.disabled = false;
				break;
			case 'syncing':
				statusText = 'Syncing...';
				iconName = 'loader-2';
				this.isSync = true;
				this.buttonEl.disabled = true;
				break;
			case 'success':
				statusText = 'Synced';
				iconName = 'check-circle';
				this.isSync = false;
				this.buttonEl.disabled = false;
				break;
			case 'error':
				statusText = message ? `Error: ${message}` : 'Sync failed';
				iconName = 'x-circle';
				this.isSync = false;
				this.buttonEl.disabled = false;
				break;
		}

		const iconEl = this.statusEl.createSpan('status-icon');
		setIcon(iconEl, iconName);
		
		this.statusEl.createSpan('status-text', { text: statusText });

		this.logger.debug(`Sync status updated: ${status}`);
	}

	showSyncProgress(): void {
		this.updateSyncStatus('syncing');
	}

	onunload(): void {
		if (this.containerEl) {
			this.containerEl.remove();
		}
		super.onunload();
	}
}