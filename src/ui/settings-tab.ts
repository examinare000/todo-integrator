import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';
import { PluginSettings } from '../settings/plugin-settings';

export class TodoIntegratorSettingsTab extends PluginSettingTab {
	private logger: Logger;
	private errorHandler: ErrorHandler;
	private pluginSettings: PluginSettings;
	private onAuthCallback: () => Promise<void>;
	private onSyncCallback: () => Promise<void>;
	private onDisconnectCallback: () => Promise<void>;

	constructor(
		app: App,
		plugin: any,
		logger: Logger,
		errorHandler: ErrorHandler,
		pluginSettings: PluginSettings,
		onAuthCallback: () => Promise<void>,
		onSyncCallback: () => Promise<void>,
		onDisconnectCallback: () => Promise<void>
	) {
		super(app, plugin);
		this.logger = logger;
		this.errorHandler = errorHandler;
		this.pluginSettings = pluginSettings;
		this.onAuthCallback = onAuthCallback;
		this.onSyncCallback = onSyncCallback;
		this.onDisconnectCallback = onDisconnectCallback;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Todo Integrator Settings' });

		this.displayAccountStatus();
		this.displayBasicSettings();
		this.displayDailyNoteSettings();
		this.displaySyncSettings();
		this.displayAuthenticationSection();
		this.displaySetupInstructions();
	}

	private displayAccountStatus(): void {
		const { containerEl } = this;
		
		containerEl.createEl('h3', { text: 'アカウント連携状態' });
		
		const statusContainer = containerEl.createDiv('account-status');
		const settings = this.pluginSettings.getCurrentSettings();
		
		if (this.pluginSettings.isAuthenticated()) {
			// Connected state
			const connectedDiv = statusContainer.createDiv('status-connected');
			connectedDiv.createEl('span', { 
				text: '✓ 連携済み', 
				cls: 'status-indicator status-connected-text' 
			});
			
			if (settings.userName) {
				connectedDiv.createEl('p', { 
					text: `ユーザー名: ${settings.userName}`,
					cls: 'user-info'
				});
			}
			
			if (settings.userEmail) {
				connectedDiv.createEl('p', { 
					text: `メールアドレス: ${settings.userEmail}`,
					cls: 'user-info'
				});
			}
			
			const expiryDate = new Date(settings.tokenExpiry);
			connectedDiv.createEl('p', { 
				text: `認証有効期限: ${expiryDate.toLocaleString('ja-JP')}`,
				cls: 'user-info expiry-info'
			});
			
			// Disconnect button
			new Setting(statusContainer)
				.addButton(button => button
					.setButtonText('連携を解除')
					.setClass('disconnect-button')
					.onClick(async () => {
						try {
							await this.onDisconnectCallback();
							this.display(); // Refresh display
							new Notice('Microsoft アカウントの連携を解除しました');
						} catch (error) {
							const errorMessage = this.errorHandler.handleApiError(error);
							new Notice(`連携解除に失敗しました: ${errorMessage}`);
						}
					}));
		} else {
			// Disconnected state
			const disconnectedDiv = statusContainer.createDiv('status-disconnected');
			disconnectedDiv.createEl('span', { 
				text: '✗ 未連携', 
				cls: 'status-indicator status-disconnected-text' 
			});
			disconnectedDiv.createEl('p', { 
				text: 'Microsoft アカウントと連携してTodoを同期できます',
				cls: 'status-message'
			});
		}

		containerEl.createEl('hr');
	}

	private displayBasicSettings(): void {
		const { containerEl } = this;
		
		containerEl.createEl('h3', { text: '基本設定' });

		// Info about the shared app registration
		const infoDiv = containerEl.createDiv('app-info');
		infoDiv.createEl('p', { 
			text: 'このプラグインは共有のMicrosoft Appアプリケーションを使用します。',
			cls: 'setting-item-description'
		});
		infoDiv.createEl('p', { 
			text: 'Azure App Registrationの設定は不要です。直接認証を開始できます。',
			cls: 'setting-item-description'
		});

		containerEl.createEl('hr');
	}

	private displayDailyNoteSettings(): void {
		const { containerEl } = this;
		
		containerEl.createEl('h3', { text: 'Daily Note 設定' });

		const settings = this.pluginSettings.getCurrentSettings();

		new Setting(containerEl)
			.setName('Daily Note フォルダ')
			.setDesc('Daily Note を保存するフォルダパス')
			.addText(text => text
				.setPlaceholder('Daily Notes')
				.setValue(settings.dailyNotePath)
				.onChange(async (value) => {
					await this.onDailyNotePathChange(value);
				}));

		new Setting(containerEl)
			.setName('日付フォーマット')
			.setDesc('Daily Note のファイル名に使用する日付フォーマット')
			.addDropdown(dropdown => dropdown
				.addOption('YYYY-MM-DD', 'YYYY-MM-DD (2024-01-01)')
				.addOption('DD/MM/YYYY', 'DD/MM/YYYY (01/01/2024)')
				.addOption('MM/DD/YYYY', 'MM/DD/YYYY (01/01/2024)')
				.addOption('MMM DD, YYYY', 'MMM DD, YYYY (Jan 01, 2024)')
				.setValue(settings.dateFormat)
				.onChange(async (value) => {
					try {
						this.pluginSettings.updateSetting('dateFormat', value);
						await this.pluginSettings.saveSettings(this.pluginSettings.getCurrentSettings());
					} catch (error) {
						const errorMessage = this.errorHandler.handleFileError(error);
						new Notice(`設定の保存に失敗しました: ${errorMessage}`);
					}
				}));

		new Setting(containerEl)
			.setName('ToDo セクションヘッダー')
			.setDesc('Daily Note 内の ToDo セクションのヘッダー名')
			.addText(text => text
				.setPlaceholder('## ToDo')
				.setValue(settings.todoSectionHeader)
				.onChange(async (value) => {
					await this.onTodoSectionHeaderChange(value);
				}));

		containerEl.createEl('hr');
	}

	private displaySyncSettings(): void {
		const { containerEl } = this;
		
		containerEl.createEl('h3', { text: '同期設定' });

		const settings = this.pluginSettings.getCurrentSettings();

		new Setting(containerEl)
			.setName('自動同期')
			.setDesc('定期的な自動同期を有効にする')
			.addToggle(toggle => toggle
				.setValue(settings.autoSync)
				.onChange(async (value) => {
					try {
						this.pluginSettings.updateSetting('autoSync', value);
						await this.pluginSettings.saveSettings(this.pluginSettings.getCurrentSettings());
					} catch (error) {
						const errorMessage = this.errorHandler.handleFileError(error);
						new Notice(`設定の保存に失敗しました: ${errorMessage}`);
					}
				}));

		new Setting(containerEl)
			.setName('同期間隔')
			.setDesc('自動同期の実行間隔（分）')
			.addSlider(slider => slider
				.setLimits(1, 60, 1)
				.setValue(settings.syncInterval / 60000)
				.setDynamicTooltip()
				.onChange(async (value) => {
					try {
						this.pluginSettings.updateSetting('syncInterval', value * 60000);
						await this.pluginSettings.saveSettings(this.pluginSettings.getCurrentSettings());
					} catch (error) {
						const errorMessage = this.errorHandler.handleFileError(error);
						new Notice(`設定の保存に失敗しました: ${errorMessage}`);
					}
				}));

		new Setting(containerEl)
			.setName('ログレベル')
			.setDesc('ログ出力のレベルを設定')
			.addDropdown(dropdown => dropdown
				.addOption('error', 'エラーのみ')
				.addOption('info', '情報（推奨）')
				.addOption('debug', 'デバッグ（詳細）')
				.setValue(settings.logLevel)
				.onChange(async (value) => {
					try {
						this.pluginSettings.updateSetting('logLevel', value as 'debug' | 'info' | 'error');
						await this.pluginSettings.saveSettings(this.pluginSettings.getCurrentSettings());
					} catch (error) {
						const errorMessage = this.errorHandler.handleFileError(error);
						new Notice(`設定の保存に失敗しました: ${errorMessage}`);
					}
				}));

		containerEl.createEl('hr');
	}

	private displayAuthenticationSection(): void {
		const { containerEl } = this;
		
		containerEl.createEl('h3', { text: '認証' });

		new Setting(containerEl)
			.setName('Microsoft 認証')
			.setDesc('Microsoft アカウントで認証してTodoの同期を開始します')
			.addButton(button => button
				.setButtonText(this.pluginSettings.isAuthenticated() ? '再認証' : '認証')
				.onClick(async () => {
					await this.onAuthButtonClick();
				}));

		new Setting(containerEl)
			.setName('手動同期')
			.setDesc('今すぐ手動で同期を実行します')
			.addButton(button => button
				.setButtonText('今すぐ同期')
				.onClick(async () => {
					await this.onSyncNowClick();
				}));

		containerEl.createEl('hr');
	}

	private displaySetupInstructions(): void {
		const { containerEl } = this;
		
		containerEl.createEl('h3', { text: 'セットアップ手順' });
		const instructionsDiv = containerEl.createDiv('setup-instructions');
		instructionsDiv.createEl('p', { text: '以下の手順でAzure App Registrationを作成してください：' });
		
		const stepsList = instructionsDiv.createEl('ol');
		stepsList.createEl('li', { text: 'https://portal.azure.com にアクセス' });
		stepsList.createEl('li', { text: 'App registrations → New registration' });
		stepsList.createEl('li', { text: 'Name: 任意の名前を入力' });
		stepsList.createEl('li', { text: 'Supported account types: "Accounts in any organizational directory and personal Microsoft accounts" を選択' });
		stepsList.createEl('li', { text: 'Redirect URI: "Mobile and desktop applications" で http://localhost を追加' });
		stepsList.createEl('li', { text: 'Register ボタンをクリック' });
		stepsList.createEl('li', { text: 'API permissions → Add permission → Microsoft Graph → Application permissions → Tasks.ReadWrite を追加' });
		stepsList.createEl('li', { text: 'Grant admin consent ボタンをクリック' });
		stepsList.createEl('li', { text: 'Overview → Application (client) ID をコピーして上記 Client ID に入力' });
	}

	async onAuthButtonClick(): Promise<void> {
		try {
			this.logger.info('Authentication initiated from settings');
			await this.onAuthCallback();
			this.display(); // Refresh display after authentication
		} catch (error) {
			const errorMessage = this.errorHandler.handleApiError(error);
			new Notice(`認証に失敗しました: ${errorMessage}`);
		}
	}

	async onSyncNowClick(): Promise<void> {
		try {
			this.logger.info('Manual sync initiated from settings');
			await this.onSyncCallback();
			new Notice('同期が完了しました');
		} catch (error) {
			const errorMessage = this.errorHandler.handleApiError(error);
			new Notice(`同期に失敗しました: ${errorMessage}`);
		}
	}

	async onDailyNotePathChange(path: string): Promise<void> {
		try {
			if (!this.pluginSettings.validateDailyNotePath(path)) {
				new Notice('無効なフォルダパスです');
				return;
			}
			this.pluginSettings.updateSetting('dailyNotePath', path);
			await this.pluginSettings.saveSettings(this.pluginSettings.getCurrentSettings());
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			new Notice(`設定の保存に失敗しました: ${errorMessage}`);
		}
	}

	async onTodoSectionHeaderChange(header: string): Promise<void> {
		try {
			if (!header || header.trim().length === 0) {
				new Notice('セクションヘッダーは必須です');
				return;
			}
			this.pluginSettings.updateSetting('todoSectionHeader', header.trim());
			await this.pluginSettings.saveSettings(this.pluginSettings.getCurrentSettings());
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			new Notice(`設定の保存に失敗しました: ${errorMessage}`);
		}
	}
}