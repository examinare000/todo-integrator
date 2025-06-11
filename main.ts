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
	Component
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

const DEFAULT_SETTINGS: TodoIntegratorSettings = {
	clientId: '',
	tenantId: 'common',
	watchDirectory: '',
	accessToken: '',
	refreshToken: '',
	tokenExpiry: 0
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
		try {
			if (!this.settings.clientId) {
				new Notice('Please set your Microsoft App Client ID in settings first');
				return;
			}

			this.msalClient = new PublicClientApplication({
				auth: {
					clientId: this.settings.clientId,
					authority: `https://login.microsoftonline.com/${this.settings.tenantId}`
				}
			});

			const accounts = await this.msalClient.getAllAccounts();
			let authResult;
			
			if (accounts.length > 0) {
				authResult = await this.msalClient.acquireTokenSilent({
					scopes: ['https://graph.microsoft.com/Tasks.ReadWrite'],
					account: accounts[0]
				}).catch(() => null);
			}
			
			if (!authResult) {
				authResult = await this.msalClient.acquireTokenByDeviceCode({
					scopes: ['https://graph.microsoft.com/Tasks.ReadWrite'],
					deviceCodeCallback: (response) => {
						new Notice(`Go to ${response.verificationUri} and enter code: ${response.userCode}`);
					}
				});
			}

			if (authResult) {
				this.settings.accessToken = authResult.accessToken;
				this.settings.tokenExpiry = authResult.expiresOn?.getTime() || 0;
				await this.saveSettings();
				await this.initializeGraphClient();
				new Notice('Successfully authenticated with Microsoft!');
			}
		} catch (error) {
			console.error('Authentication failed:', error);
			new Notice('Authentication failed. Check console for details.');
		}
	}

	async initializeGraphClient() {
		if (!this.settings.accessToken) return;

		this.graphClient = Client.init({
			authProvider: async () => {
				if (Date.now() > this.settings.tokenExpiry) {
					await this.refreshAccessToken();
				}
				return this.settings.accessToken;
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

	startWatching() {
		if (this.settings.watchDirectory) {
			new Notice(`Started watching ${this.settings.watchDirectory} for new todos`);
		}
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

		new Setting(containerEl)
			.setName('Setup Instructions')
			.setDesc('1. Create a Microsoft App Registration at https://portal.azure.com\n2. Add "Mobile and desktop applications" platform with redirect URI: http://localhost\n3. Enable "Tasks.ReadWrite" API permission\n4. Copy the Client ID above and authenticate')
			.addButton(button => button
				.setButtonText('Authenticate')
				.onClick(() => {
					this.plugin.authenticateWithMicrosoft();
				}));
	}
}