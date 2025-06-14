import { Plugin, Notice } from 'obsidian';

// Core components
import { Logger } from './utils/logger';
import { ErrorHandler } from './utils/error-handler';
import { PluginSettings } from './settings/plugin-settings';
import { MSALAuthenticationManager } from './auth/msal-authentication-manager';
import { TodoApiClient } from './api/todo-api-client';
import { DailyNoteManager } from './daily-note/daily-note-manager';
import { ObsidianTodoParser } from './parser/obsidian-todo-parser';
import { TodoSynchronizer } from './sync/todo-synchronizer';

// UI components
import { TodoIntegratorSettingsTab } from './ui/settings-tab';
import { SidebarButton } from './ui/sidebar-button';
import { AuthenticationModal } from './ui/authentication-modal';

// Types
import { DEFAULT_SETTINGS, SyncResult } from './types';

export default class TodoIntegratorPlugin extends Plugin {
	private logger: Logger;
	private errorHandler: ErrorHandler;
	private pluginSettings: PluginSettings;
	private authManager: MSALAuthenticationManager;
	private todoApiClient: TodoApiClient;
	private dailyNoteManager: DailyNoteManager;
	private obsidianTodoParser: ObsidianTodoParser;
	private todoSynchronizer: TodoSynchronizer;
	private sidebarButton: SidebarButton;
	private autoSyncInterval: NodeJS.Timeout | null = null;

	async onload(): Promise<void> {
		console.log('Loading Todo Integrator plugin...');

		// Initialize core components
		this.initializeComponents();

		// Load settings
		await this.loadSettings();

		// Add commands
		this.addCommands();

		// Add ribbon icon
		this.addRibbonIcon('sync', 'Sync Microsoft Todo', () => {
			this.performManualSync();
		});

		// Add settings tab
		this.addSettingTab(new TodoIntegratorSettingsTab(
			this.app,
			this,
			this.logger,
			this.errorHandler,
			this.pluginSettings,
			() => this.authenticateWithMicrosoft(),
			() => this.performManualSync(),
			() => this.disconnectAccount()
		));

		// Create sidebar button
		this.createSidebarButton();

		// Initialize authentication if we have credentials
		if (this.pluginSettings.isAuthenticated()) {
			await this.initializeAfterAuth();
		}

		this.logger.info('Todo Integrator plugin loaded successfully');
	}

	onunload(): void {
		this.cleanup();
		this.logger.info('Todo Integrator plugin unloaded');
		console.log('Todo Integrator plugin unloaded');
	}

	private initializeComponents(): void {
		this.logger = new Logger(DEFAULT_SETTINGS.logLevel);
		this.errorHandler = new ErrorHandler(this.logger);
		
		this.pluginSettings = new PluginSettings(
			this.logger,
			this.errorHandler,
			() => this.loadData(),
			(data) => this.saveData(data)
		);

		this.authManager = new MSALAuthenticationManager(this.logger, this.errorHandler);
		this.todoApiClient = new TodoApiClient(this.logger, this.errorHandler);
		this.dailyNoteManager = new DailyNoteManager(this.app, this.logger, this.errorHandler);
		this.obsidianTodoParser = new ObsidianTodoParser(this.app, this.logger, this.errorHandler);
		
		this.todoSynchronizer = new TodoSynchronizer(
			this.todoApiClient,
			this.dailyNoteManager,
			this.obsidianTodoParser,
			this.logger,
			this.errorHandler
		);

		this.sidebarButton = new SidebarButton(
			this.app,
			this.logger,
			this.errorHandler,
			() => this.performManualSync()
		);
	}

	private async loadSettings(): Promise<void> {
		try {
			const settings = await this.pluginSettings.loadSettings();
			this.logger.setLogLevel(settings.logLevel);
			
			// Update daily note manager settings
			this.dailyNoteManager.updateSettings(
				settings.dailyNotePath,
				settings.dateFormat,
				settings.todoSectionHeader
			);

			this.logger.debug('Settings loaded and applied');
		} catch (error) {
			this.logger.error('Failed to load settings', error);
			new Notice('設定の読み込みに失敗しました');
		}
	}

	private addCommands(): void {
		this.addCommand({
			id: 'authenticate-microsoft',
			name: 'Microsoft アカウントで認証',
			callback: () => this.authenticateWithMicrosoft()
		});

		this.addCommand({
			id: 'sync-todos',
			name: 'ToDo を同期',
			callback: () => this.performManualSync()
		});

		this.addCommand({
			id: 'disconnect-account',
			name: 'Microsoft アカウントの連携を解除',
			callback: () => this.disconnectAccount()
		});
	}

	private createSidebarButton(): void {
		// For now, we'll add the sync functionality via commands and ribbon
		// Sidebar button placement would need more complex DOM manipulation
		this.logger.debug('Sidebar button functionality available via ribbon and commands');
	}

	private async initializeAfterAuth(): Promise<void> {
		try {
			const settings = this.pluginSettings.getCurrentSettings();
			const clientConfig = this.pluginSettings.getClientConfig();

			// Initialize authentication manager
			await this.authManager.initialize(clientConfig.clientId, clientConfig.tenantId);

			// Initialize API client
			this.todoApiClient.initialize(settings.accessToken);
			await this.todoApiClient.getOrCreateTaskList();

			// Start auto-sync if enabled
			if (settings.autoSync) {
				this.startAutoSync();
			}

			this.logger.info('Post-authentication initialization completed');
		} catch (error) {
			this.logger.error('Post-authentication initialization failed', error);
			new Notice('初期化に失敗しました。再認証が必要な可能性があります。');
		}
	}

	async authenticateWithMicrosoft(): Promise<void> {
		const authModal = new AuthenticationModal(this.app, this.logger, this.errorHandler);
		authModal.open();

		try {
			const settings = this.pluginSettings.getCurrentSettings();
			if (!settings.clientId) {
				throw new Error('設定でMicrosoft App Client IDを設定してください');
			}

			const clientConfig = this.pluginSettings.getClientConfig();
			await this.authManager.initialize(clientConfig.clientId, clientConfig.tenantId);

			// Device code flow with modal integration
			const authResult = await this.authManager.authenticate();

			if (authResult) {
				// Update settings with auth result
				this.pluginSettings.updateSetting('accessToken', authResult.accessToken);
				this.pluginSettings.updateSetting('tokenExpiry', authResult.expiresOn?.getTime() || 0);

				// Get user info
				await this.fetchUserInfo();
				
				// Save settings
				await this.pluginSettings.saveSettings(this.pluginSettings.getCurrentSettings());

				// Initialize API client
				this.todoApiClient.initialize(authResult.accessToken);
				await this.todoApiClient.getOrCreateTaskList();

				// Start auto-sync if enabled
				if (this.pluginSettings.getCurrentSettings().autoSync) {
					this.startAutoSync();
				}

				authModal.showSuccess();
				new Notice('Microsoft認証が成功しました！');
				this.logger.info('Authentication completed successfully');
			}
		} catch (error) {
			this.logger.error('Authentication failed', error);
			const errorMessage = this.errorHandler.handleApiError(error);
			authModal.showError(errorMessage);
			new Notice(`認証に失敗しました: ${errorMessage}`);
		}
	}

	private async fetchUserInfo(): Promise<void> {
		try {
			// This would need to be implemented in the TodoApiClient or a separate user info service
			// For now, we'll use placeholder values
			this.pluginSettings.updateSetting('userEmail', 'user@example.com');
			this.pluginSettings.updateSetting('userName', 'Microsoft User');
		} catch (error) {
			this.logger.error('Failed to fetch user info', error);
		}
	}

	async performManualSync(): Promise<void> {
		if (!this.pluginSettings.isAuthenticated()) {
			new Notice('認証が必要です。設定から Microsoft アカウントで認証してください。');
			return;
		}

		if (!this.todoApiClient.isInitialized()) {
			new Notice('API クライアントが初期化されていません。再認証してください。');
			return;
		}

		try {
			this.logger.info('Manual sync initiated');
			this.sidebarButton.showSyncProgress();

			const result: SyncResult = await this.todoSynchronizer.performFullSync();

			if (result.success) {
				const message = `同期完了: Microsoft Todo ${result.newTasksFromMsft}件、Obsidian ${result.newTasksFromObsidian}件、完了 ${result.completedTasks}件`;
				new Notice(message);
				this.logger.info(message);
			} else {
				const errorMessage = `同期中にエラーが発生しました: ${result.errors.join(', ')}`;
				new Notice(errorMessage);
				this.logger.error(errorMessage);
			}

		} catch (error) {
			this.logger.error('Manual sync failed', error);
			const errorMessage = this.errorHandler.handleApiError(error);
			new Notice(`同期に失敗しました: ${errorMessage}`);
		}
	}

	async disconnectAccount(): Promise<void> {
		try {
			await this.authManager.logout();
			this.pluginSettings.clearAuthenticationData();
			await this.pluginSettings.saveSettings(this.pluginSettings.getCurrentSettings());
			
			this.stopAutoSync();
			
			new Notice('Microsoft アカウントの連携を解除しました');
			this.logger.info('Account disconnected');
		} catch (error) {
			this.logger.error('Failed to disconnect account', error);
			const errorMessage = this.errorHandler.handleApiError(error);
			new Notice(`連携解除に失敗しました: ${errorMessage}`);
		}
	}

	private startAutoSync(): void {
		const settings = this.pluginSettings.getCurrentSettings();
		if (!settings.autoSync) return;

		this.stopAutoSync(); // Clear any existing interval

		this.autoSyncInterval = setInterval(async () => {
			try {
				this.logger.debug('Auto sync triggered');
				await this.todoSynchronizer.performFullSync();
			} catch (error) {
				this.logger.error('Auto sync failed', error);
			}
		}, settings.syncInterval);

		this.logger.info(`Auto sync started with ${settings.syncInterval / 60000} minute intervals`);
	}

	private stopAutoSync(): void {
		if (this.autoSyncInterval) {
			clearInterval(this.autoSyncInterval);
			this.autoSyncInterval = null;
			this.logger.info('Auto sync stopped');
		}
	}

	private cleanup(): void {
		this.stopAutoSync();
		
		if (this.sidebarButton) {
			this.sidebarButton.unload();
		}
	}
}