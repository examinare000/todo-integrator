import { 
	App, 
	Editor, 
	MarkdownView, 
	Modal, 
	Notice, 
	Plugin, 
	PluginSettingTab, 
	Setting, 
	TFile,
	Vault,
	Component,
	ButtonComponent
} from 'obsidian';
import { Client } from '@microsoft/microsoft-graph-client';
import { PublicClientApplication, AuthenticationResult } from '@azure/msal-node';
import 'isomorphic-fetch';

interface TodoIntegratorSettings {
	clientId: string;
	tenantId: string;
	watchDirectory: string;
	accessToken: string;
	refreshToken: string;
	tokenExpiry: number;
	userEmail: string;
	userName: string;
}

interface TodoTask {
	id?: string;
	title: string;
	body?: string;
	dueDateTime?: string;
	status: 'notStarted' | 'inProgress' | 'completed';
	createdDateTime?: string;
	completedDateTime?: string;
}

interface ObsidianTask {
	file: TFile;
	line: number;
	text: string;
	completed: boolean;
	dueDate?: string;
	todoId?: string;
}

export const DEFAULT_SETTINGS: TodoIntegratorSettings = {
	clientId: '',
	tenantId: 'common',
	watchDirectory: '',
	accessToken: '',
	refreshToken: '',
	tokenExpiry: 0,
	userEmail: '',
	userName: ''
};

export default class TodoIntegratorPlugin extends Plugin {
	settings: TodoIntegratorSettings;
	msalClient: PublicClientApplication;
	graphClient: Client;
	taskMap: Map<string, ObsidianTask> = new Map();
	listId: string = '';

	async onload() {
		await this.loadSettings();
		
		this.addCommand({
			id: 'authenticate-microsoft',
			name: 'Authenticate with Microsoft',
			callback: () => this.authenticateWithMicrosoft()
		});

		this.addCommand({
			id: 'sync-todos',
			name: 'Sync todos',
			callback: () => this.syncTodos()
		});

		this.addRibbonIcon('sync', 'Sync Microsoft Todo', () => {
			this.syncTodos();
		});

		this.addSettingTab(new TodoIntegratorSettingTab(this.app, this));

		if (this.settings.accessToken && this.settings.watchDirectory) {
			await this.initializeGraphClient();
			this.startWatching();
		}

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && this.shouldWatchFile(file)) {
					this.debounceFileCheck(file);
				}
			})
		);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	shouldWatchFile(file: TFile): boolean {
		if (!this.settings.watchDirectory) return false;
		if (!file.path.endsWith('.md')) return false;
		return file.path.startsWith(this.settings.watchDirectory);
	}

	private debounceTimeout: NodeJS.Timeout | null = null;
	debounceFileCheck(file: TFile) {
		if (this.debounceTimeout) {
			clearTimeout(this.debounceTimeout);
		}
		this.debounceTimeout = setTimeout(() => {
			this.checkFileForTodos(file);
		}, 1000);
	}

	async authenticateWithMicrosoft() {
		if (!this.settings.clientId) {
			new Notice('設定でMicrosoft App Client IDを設定してください');
			return;
		}

		const authModal = new AuthProgressModal(this.app);
		authModal.open();

		try {
			// MSALクライアントの初期化（最新仕様）
			this.msalClient = new PublicClientApplication({
				auth: {
					clientId: this.settings.clientId,
					authority: this.settings.tenantId ? 
						`https://login.microsoftonline.com/${this.settings.tenantId}` : 
						'https://login.microsoftonline.com/common'
				},
				system: {
					loggerOptions: {
						loggerCallback: (level, message, containsPii) => {
							if (containsPii) return;
							console.log(`MSAL [${level}]: ${message}`);
						},
						piiLoggingEnabled: false,
						logLevel: 3 // Info level
					}
				}
			});

			// キャッシュからアカウントを取得
			const accounts = await this.msalClient.getAllAccounts();
			let authResult = null;
			
			// サイレント認証を試行
			if (accounts.length > 0) {
				try {
					authResult = await this.msalClient.acquireTokenSilent({
						scopes: ['https://graph.microsoft.com/Tasks.ReadWrite'],
						account: accounts[0]
					});
				} catch (silentError) {
					console.log('Silent authentication failed:', silentError);
					// サイレント認証に失敗した場合はデバイスコードフローを使用
				}
			}
			
			// サイレント認証が失敗した場合はデバイスコードフローを使用
			if (!authResult) {
				const deviceCodeRequest = {
					scopes: ['https://graph.microsoft.com/Tasks.ReadWrite'],
					deviceCodeCallback: (response: any) => {
						authModal.showDeviceCodeInstructions(response.userCode, response.verificationUri);
					}
				};

				authResult = await this.msalClient.acquireTokenByDeviceCode(deviceCodeRequest);
			}

			if (authResult) {
				this.settings.accessToken = authResult.accessToken;
				this.settings.tokenExpiry = authResult.expiresOn?.getTime() || 0;
				
				// ユーザー情報を取得
				await this.fetchUserInfo();
				
				await this.saveSettings();
				await this.initializeGraphClient();
				authModal.showSuccess();
				new Notice('Microsoft認証が成功しました！');
			}
		} catch (error) {
			console.error('Authentication failed:', error);
			
			// エラー詳細の解析
			let errorMessage = '不明なエラーが発生しました';
			if (error instanceof Error) {
				if (error.message.includes('invalid_client')) {
					errorMessage = 'Client IDまたはアプリ設定が無効です。Azure App Registrationの設定を確認してください。';
				} else if (error.message.includes('invalid_scope')) {
					errorMessage = 'APIアクセス許可が不足しています。Tasks.ReadWriteが追加されているか確認してください。';
				} else if (error.message.includes('network')) {
					errorMessage = 'ネットワークエラーが発生しました。インターネット接続を確認してください。';
				} else {
					errorMessage = `認証エラー: ${error.message}`;
				}
			}
			
			authModal.showError(errorMessage);
			new Notice('認証に失敗しました。詳細はコンソールを確認してください。');
		}
	}

	async initializeGraphClient() {
		if (!this.settings.accessToken) return;

		// Microsoft Graph Client の最新初期化方式
		this.graphClient = Client.init({
			authProvider: async (done) => {
				try {
					// トークンの有効期限をチェック
					if (Date.now() > this.settings.tokenExpiry) {
						await this.refreshAccessToken();
					}
					
					// Bearer トークンを返す
					done(null, `Bearer ${this.settings.accessToken}`);
				} catch (error) {
					console.error('Auth provider error:', error);
					done(error, null);
				}
			}
		});

		await this.getOrCreateTaskList();
	}

	async refreshAccessToken() {
		try {
			const accounts = await this.msalClient.getAllAccounts();
			if (accounts.length === 0) {
				throw new Error('No accounts found');
			}

			const authResult = await this.msalClient.acquireTokenSilent({
				scopes: ['https://graph.microsoft.com/Tasks.ReadWrite'],
				account: accounts[0]
			});

			if (authResult) {
				this.settings.accessToken = authResult.accessToken;
				this.settings.tokenExpiry = authResult.expiresOn?.getTime() || 0;
				await this.saveSettings();
			}
		} catch (error) {
			console.error('Token refresh failed:', error);
			new Notice('Please re-authenticate with Microsoft');
		}
	}

	async getOrCreateTaskList() {
		try {
			const lists = await this.graphClient.api('/me/todo/lists').get();
			let obsidianList = lists.value.find((list: any) => list.displayName === 'Obsidian Tasks');
			
			if (!obsidianList) {
				obsidianList = await this.graphClient.api('/me/todo/lists').post({
					displayName: 'Obsidian Tasks'
				});
			}
			
			this.listId = obsidianList.id;
		} catch (error) {
			console.error('Failed to get/create task list:', error);
		}
	}

	async checkFileForTodos(file: TFile) {
		if (!this.graphClient || !this.listId) return;

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const checkboxMatch = line.match(/^(\s*)-\s*\[( |x)\]\s*(.+)/);
			
			if (checkboxMatch) {
				const [, indent, checked, taskText] = checkboxMatch;
				const isCompleted = checked === 'x';
				const taskKey = `${file.path}:${i}`;
				
				if (!this.taskMap.has(taskKey) && !isCompleted) {
					const dueDate = this.extractDueDate(taskText);
					await this.createMicrosoftTask(file, i, taskText, dueDate);
				}
			}
		}
	}

	extractDueDate(text: string): string | undefined {
		const dueDateMatch = text.match(/due:\s*(\d{4}-\d{2}-\d{2})/);
		return dueDateMatch ? dueDateMatch[1] : undefined;
	}

	async createMicrosoftTask(file: TFile, line: number, text: string, dueDate?: string) {
		try {
			const task: TodoTask = {
				title: text.replace(/due:\s*\d{4}-\d{2}-\d{2}/, '').trim(),
				body: `From: ${file.path}:${line + 1}`,
				status: 'notStarted'
			};

			if (dueDate) {
				task.dueDateTime = `${dueDate}T23:59:59.000Z`;
			}

			const createdTask = await this.graphClient
				.api(`/me/todo/lists/${this.listId}/tasks`)
				.post(task);

			this.taskMap.set(`${file.path}:${line}`, {
				file,
				line,
				text,
				completed: false,
				dueDate,
				todoId: createdTask.id
			});

			new Notice(`Created Microsoft Todo task: ${task.title}`);
		} catch (error) {
			console.error('Failed to create task:', error);
		}
	}

	async syncTodos() {
		if (!this.graphClient || !this.listId) {
			new Notice('Please authenticate with Microsoft first');
			return;
		}

		try {
			const tasks = await this.graphClient
				.api(`/me/todo/lists/${this.listId}/tasks`)
				.get();

			for (const task of tasks.value) {
				if (task.body && task.body.content) {
					const match = task.body.content.match(/From: (.+):(\d+)/);
					if (match) {
						const [, filePath, lineNum] = match;
						const taskKey = `${filePath}:${parseInt(lineNum) - 1}`;
						
						if (task.status === 'completed') {
							await this.markObsidianTaskComplete(filePath, parseInt(lineNum) - 1);
						}
					}
				}
			}

			new Notice('Todo synchronization completed');
		} catch (error) {
			console.error('Sync failed:', error);
			new Notice('Sync failed. Check console for details.');
		}
	}

	async markObsidianTaskComplete(filePath: string, lineIndex: number) {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) return;

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			
			if (lineIndex < lines.length) {
				const line = lines[lineIndex];
				const checkboxMatch = line.match(/^(\s*)-\s*\[( |x)\]\s*(.+)/);
				
				if (checkboxMatch && checkboxMatch[2] === ' ') {
					const [, indent, , taskText] = checkboxMatch;
					const today = new Date().toISOString().split('T')[0];
					lines[lineIndex] = `${indent}- [x] ${taskText} #complete_date/${today}`;
					
					await this.app.vault.modify(file, lines.join('\n'));
					new Notice(`Marked task complete: ${taskText}`);
				}
			}
		} catch (error) {
			console.error('Failed to mark task complete:', error);
		}
	}

	async fetchUserInfo() {
		if (!this.settings.accessToken) return;

		try {
			// ユーザー情報取得用の一時的なGraphクライアント
			const tempGraphClient = Client.init({
				authProvider: async (done) => {
					try {
						done(null, `Bearer ${this.settings.accessToken}`);
					} catch (error) {
						done(error, null);
					}
				}
			});

			const user = await tempGraphClient
				.api('/me')
				.select('displayName,mail,userPrincipalName')
				.get();
				
			this.settings.userEmail = user.mail || user.userPrincipalName || '';
			this.settings.userName = user.displayName || '';
		} catch (error) {
			console.error('Failed to fetch user info:', error);
		}
	}

	isAuthenticated(): boolean {
		return !!(this.settings.accessToken && Date.now() < this.settings.tokenExpiry);
	}

	async disconnectAccount() {
		this.settings.accessToken = '';
		this.settings.refreshToken = '';
		this.settings.tokenExpiry = 0;
		this.settings.userEmail = '';
		this.settings.userName = '';
		this.graphClient = undefined as any;
		this.listId = '';
		this.taskMap.clear();
		await this.saveSettings();
		new Notice('Microsoftアカウントの連携を解除しました');
	}

	startWatching() {
		if (this.settings.watchDirectory) {
			new Notice(`Started watching ${this.settings.watchDirectory} for new todos`);
		}
	}
}

class AuthProgressModal extends Modal {
	private progressEl: HTMLElement;
	private instructionsEl: HTMLElement;
	private statusEl: HTMLElement;
	private copyButton: ButtonComponent;
	private currentStep: number = 0;
	private deviceCode: string = '';
	private verificationUri: string = '';

	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Microsoft アカウント認証' });

		this.progressEl = contentEl.createDiv('auth-progress');
		this.updateProgress(0);

		this.statusEl = contentEl.createDiv('auth-status');
		this.statusEl.createEl('p', { text: '認証を開始しています...' });

		this.instructionsEl = contentEl.createDiv('auth-instructions');
		this.instructionsEl.hide();

		const buttonContainer = contentEl.createDiv('auth-buttons');
		buttonContainer.hide();

		this.copyButton = new ButtonComponent(buttonContainer)
			.setButtonText('認証コードをコピー')
			.onClick(() => {
				navigator.clipboard.writeText(this.deviceCode);
				new Notice('認証コードがクリップボードにコピーされました');
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('ブラウザーで開く')
			.onClick(() => {
				window.open(this.verificationUri, '_blank');
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('キャンセル')
			.onClick(() => {
				this.close();
			});
	}

	updateProgress(step: number) {
		this.currentStep = step;
		const steps = [
			'認証を開始中...',
			'認証コードを生成中...',
			'ユーザー認証を待機中...',
			'認証完了'
		];

		this.progressEl.empty();
		
		const progressBar = this.progressEl.createDiv('progress-bar');
		const progressFill = progressBar.createDiv('progress-fill');
		progressFill.style.width = `${(step / 3) * 100}%`;

		this.progressEl.createEl('p', { 
			text: `ステップ ${step + 1}/4: ${steps[step]}`,
			cls: 'progress-text'
		});
	}

	showDeviceCodeInstructions(userCode: string, verificationUri: string) {
		this.deviceCode = userCode;
		this.verificationUri = verificationUri;
		
		this.updateProgress(1);
		
		this.statusEl.empty();
		this.statusEl.createEl('h3', { text: '認証手順' });
		
		const instructions = this.statusEl.createDiv('device-code-instructions');
		instructions.createEl('p', { text: '以下の手順で認証を完了してください：' });
		
		const stepsList = instructions.createEl('ol');
		stepsList.createEl('li', { text: '下の「ブラウザーで開く」ボタンをクリック' });
		stepsList.createEl('li', { text: 'Microsoft ログインページにサインイン' });
		stepsList.createEl('li', { text: '以下の認証コードを入力：' });
		
		const codeDisplay = instructions.createDiv('code-display');
		codeDisplay.createEl('code', { text: userCode, cls: 'device-code' });
		
		instructions.createEl('p', { text: '認証が完了するまでこのウィンドウを開いたままにしてください。' });
		
		this.instructionsEl.show();
		const buttonContainer = this.contentEl.querySelector('.auth-buttons') as HTMLElement;
		if (buttonContainer) buttonContainer.show();
		
		this.updateProgress(2);
	}

	showSuccess() {
		this.updateProgress(3);
		this.statusEl.empty();
		this.statusEl.createEl('h3', { text: '認証成功！' });
		this.statusEl.createEl('p', { text: 'Microsoft Todo との連携が完了しました。' });
		
		const buttonContainer = this.contentEl.querySelector('.auth-buttons') as HTMLElement;
		if (buttonContainer) buttonContainer.hide();
		
		setTimeout(() => {
			this.close();
		}, 2000);
	}

	showError(error: string) {
		this.statusEl.empty();
		this.statusEl.createEl('h3', { text: '認証エラー' });
		this.statusEl.createEl('p', { text: error });
		this.statusEl.createEl('p', { text: '設定を確認してもう一度お試しください。' });
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class TodoIntegratorSettingTab extends PluginSettingTab {
	plugin: TodoIntegratorPlugin;

	constructor(app: App, plugin: TodoIntegratorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// アカウント連携状態セクション
		containerEl.createEl('h3', { text: 'アカウント連携状態' });
		
		const statusContainer = containerEl.createDiv('account-status');
		
		if (this.plugin.isAuthenticated()) {
			// 連携済み表示
			const connectedDiv = statusContainer.createDiv('status-connected');
			connectedDiv.createEl('span', { 
				text: '✓ 連携済み', 
				cls: 'status-indicator status-connected-text' 
			});
			
			if (this.plugin.settings.userName) {
				connectedDiv.createEl('p', { 
					text: `ユーザー名: ${this.plugin.settings.userName}`,
					cls: 'user-info'
				});
			}
			
			if (this.plugin.settings.userEmail) {
				connectedDiv.createEl('p', { 
					text: `メールアドレス: ${this.plugin.settings.userEmail}`,
					cls: 'user-info'
				});
			}
			
			const expiryDate = new Date(this.plugin.settings.tokenExpiry);
			connectedDiv.createEl('p', { 
				text: `認証有効期限: ${expiryDate.toLocaleString('ja-JP')}`,
				cls: 'user-info expiry-info'
			});
			
			// 連携解除ボタン
			new Setting(statusContainer)
				.addButton(button => button
					.setButtonText('連携を解除')
					.setClass('disconnect-button')
					.onClick(async () => {
						await this.plugin.disconnectAccount();
						this.display(); // 画面を更新
					}));
		} else {
			// 未連携表示
			const disconnectedDiv = statusContainer.createDiv('status-disconnected');
			disconnectedDiv.createEl('span', { 
				text: '✗ 未連携', 
				cls: 'status-indicator status-disconnected-text' 
			});
			disconnectedDiv.createEl('p', { 
				text: 'Microsoftアカウントと連携してTodoを同期できます',
				cls: 'status-message'
			});
		}

		containerEl.createEl('hr');

		// 設定セクション
		containerEl.createEl('h3', { text: '基本設定' });

		new Setting(containerEl)
			.setName('Microsoft App Client ID')
			.setDesc('Your Microsoft App Registration Client ID')
			.addText(text => text
				.setPlaceholder('Enter your Client ID')
				.setValue(this.plugin.settings.clientId)
				.onChange(async (value) => {
					this.plugin.settings.clientId = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Tenant ID')
			.setDesc('Your Microsoft Tenant ID (default: common)')
			.addText(text => text
				.setPlaceholder('common')
				.setValue(this.plugin.settings.tenantId)
				.onChange(async (value) => {
					this.plugin.settings.tenantId = value || 'common';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Watch Directory')
			.setDesc('Directory to monitor for new todos (e.g., "Tasks/" or leave empty for all)')
			.addText(text => text
				.setPlaceholder('Tasks/')
				.setValue(this.plugin.settings.watchDirectory)
				.onChange(async (value) => {
					this.plugin.settings.watchDirectory = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('hr');

		// 認証セクション
		containerEl.createEl('h3', { text: '認証' });

		new Setting(containerEl)
			.setName('Microsoft認証')
			.setDesc('Microsoftアカウントで認証してTodoの同期を開始します')
			.addButton(button => button
				.setButtonText(this.plugin.isAuthenticated() ? '再認証' : '認証')
				.onClick(() => {
					this.plugin.authenticateWithMicrosoft();
				}));

		// セットアップ手順
		containerEl.createEl('h3', { text: 'セットアップ手順' });
		const instructionsDiv = containerEl.createDiv('setup-instructions');
		instructionsDiv.createEl('p', { text: '以下の手順でAzure App Registrationを作成してください：' });
		
		const stepsList = instructionsDiv.createEl('ol');
		stepsList.createEl('li', { text: 'https://portal.azure.com にアクセス' });
		stepsList.createEl('li', { text: 'App registrations → New registration' });
		stepsList.createEl('li', { text: 'Redirect URI: "Mobile and desktop applications" で http://localhost を追加' });
		stepsList.createEl('li', { text: 'API permissions → Add permission → Microsoft Graph → Tasks.ReadWrite' });
		stepsList.createEl('li', { text: 'Overview → Application (client) IDをコピーして上記に入力' });
	}
}