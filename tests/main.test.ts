import TodoIntegratorPlugin from '../main';
import { Logger } from '../src/utils/logger';
import { ErrorHandler } from '../src/utils/error-handler';
import { PluginSettings } from '../src/settings/plugin-settings';
import { MSALAuthenticationManager } from '../src/auth/msal-authentication-manager';
import { TodoApiClient } from '../src/api/todo-api-client';

// Mock Obsidian
jest.mock('obsidian', () => ({
	Plugin: class MockPlugin {
		app = {
			workspace: {
				leftSplit: null
			}
		};
		addCommand = jest.fn();
		addRibbonIcon = jest.fn();
		addSettingTab = jest.fn();
		loadData = jest.fn().mockResolvedValue({});
		saveData = jest.fn().mockResolvedValue(void 0);
	},
	Notice: jest.fn(),
}));

// Mock dependencies
jest.mock('../src/utils/logger');
jest.mock('../src/utils/error-handler');
jest.mock('../src/settings/plugin-settings');
jest.mock('../src/auth/msal-authentication-manager');
jest.mock('../src/api/todo-api-client');
jest.mock('../src/daily-note/daily-note-manager');
jest.mock('../src/parser/obsidian-todo-parser');
jest.mock('../src/sync/todo-synchronizer');
jest.mock('../src/ui/settings-tab');
jest.mock('../src/ui/sidebar-button');
jest.mock('../src/ui/authentication-modal');

describe('TodoIntegratorPlugin', () => {
	let plugin: TodoIntegratorPlugin;
	let mockApp: any;

	beforeEach(() => {
		mockApp = {
			workspace: {
				leftSplit: null
			}
		};
		plugin = new TodoIntegratorPlugin(mockApp, {} as any);
		
		// Reset all mocks
		jest.clearAllMocks();
	});

	describe('Plugin Lifecycle', () => {
		describe('onload', () => {
			it('should initialize all components', async () => {
				const loadSettingsSpy = jest.spyOn(plugin as any, 'loadSettings').mockResolvedValue(void 0);
				const addCommandsSpy = jest.spyOn(plugin as any, 'addCommands').mockImplementation();
				const createSidebarButtonSpy = jest.spyOn(plugin as any, 'createSidebarButton').mockImplementation();

				await plugin.onload();

				expect(loadSettingsSpy).toHaveBeenCalled();
				expect(addCommandsSpy).toHaveBeenCalled();
				expect(createSidebarButtonSpy).toHaveBeenCalled();
				expect(plugin.addRibbonIcon).toHaveBeenCalledWith('sync', 'Sync Microsoft Todo', expect.any(Function));
				expect(plugin.addSettingTab).toHaveBeenCalled();
			});

			it('should initialize components in correct order', async () => {
				const initSpy = jest.spyOn(plugin as any, 'initializeComponents');
				const loadSettingsSpy = jest.spyOn(plugin as any, 'loadSettings').mockResolvedValue(void 0);
				
				await plugin.onload();

				expect(initSpy).toHaveBeenCalledBefore(loadSettingsSpy as any);
			});

			it('should handle authentication if already authenticated', async () => {
				const mockSettings = {
					isAuthenticated: jest.fn().mockReturnValue(true)
				};
				const initAfterAuthSpy = jest.spyOn(plugin as any, 'initializeAfterAuth').mockResolvedValue(void 0);
				
				(plugin as any).pluginSettings = mockSettings;
				jest.spyOn(plugin as any, 'loadSettings').mockResolvedValue(void 0);

				await plugin.onload();

				expect(initAfterAuthSpy).toHaveBeenCalled();
			});
		});

		describe('onunload', () => {
			it('should cleanup resources', () => {
				const cleanupSpy = jest.spyOn(plugin as any, 'cleanup').mockImplementation();

				plugin.onunload();

				expect(cleanupSpy).toHaveBeenCalled();
			});

			it('should stop auto sync', () => {
				const stopAutoSyncSpy = jest.spyOn(plugin as any, 'stopAutoSync').mockImplementation();
				
				plugin.onunload();

				expect(stopAutoSyncSpy).toHaveBeenCalled();
			});
		});
	});

	describe('Component Initialization', () => {
		it('should initialize all core components', () => {
			(plugin as any).initializeComponents();

			expect((plugin as any).logger).toBeInstanceOf(Logger);
			expect((plugin as any).errorHandler).toBeInstanceOf(ErrorHandler);
			expect((plugin as any).pluginSettings).toBeInstanceOf(PluginSettings);
			expect((plugin as any).authManager).toBeInstanceOf(MSALAuthenticationManager);
			expect((plugin as any).todoApiClient).toBeInstanceOf(TodoApiClient);
		});
	});

	describe('Commands Registration', () => {
		it('should register all required commands', () => {
			(plugin as any).addCommands();

			expect(plugin.addCommand).toHaveBeenCalledTimes(3);
			expect(plugin.addCommand).toHaveBeenCalledWith({
				id: 'authenticate-microsoft',
				name: 'Microsoft アカウントで認証',
				callback: expect.any(Function)
			});
			expect(plugin.addCommand).toHaveBeenCalledWith({
				id: 'sync-todos',
				name: 'ToDo を同期',
				callback: expect.any(Function)
			});
			expect(plugin.addCommand).toHaveBeenCalledWith({
				id: 'disconnect-account',
				name: 'Microsoft アカウントの連携を解除',
				callback: expect.any(Function)
			});
		});
	});

	describe('Settings Management', () => {
		it('should load and apply settings', async () => {
			const mockSettings = {
				logLevel: 'info',
				dailyNotePath: 'Daily Notes',
				dateFormat: 'YYYY-MM-DD',
				todoSectionHeader: '## ToDo'
			};
			const mockPluginSettings = {
				loadSettings: jest.fn().mockResolvedValue(mockSettings)
			};
			const mockLogger = {
				setLogLevel: jest.fn()
			};
			const mockDailyNoteManager = {
				updateSettings: jest.fn()
			};

			(plugin as any).pluginSettings = mockPluginSettings;
			(plugin as any).logger = mockLogger;
			(plugin as any).dailyNoteManager = mockDailyNoteManager;

			await (plugin as any).loadSettings();

			expect(mockPluginSettings.loadSettings).toHaveBeenCalled();
			expect(mockLogger.setLogLevel).toHaveBeenCalledWith('info');
			expect(mockDailyNoteManager.updateSettings).toHaveBeenCalledWith(
				'Daily Notes',
				'YYYY-MM-DD',
				'## ToDo'
			);
		});

		it('should handle settings loading errors', async () => {
			const mockPluginSettings = {
				loadSettings: jest.fn().mockRejectedValue(new Error('Settings error'))
			};
			const mockLogger = {
				error: jest.fn(),
				setLogLevel: jest.fn()
			};

			(plugin as any).pluginSettings = mockPluginSettings;
			(plugin as any).logger = mockLogger;

			await (plugin as any).loadSettings();

			expect(mockLogger.error).toHaveBeenCalledWith('Failed to load settings', expect.any(Error));
		});
	});

	describe('Authentication Flow', () => {
		it('should handle successful authentication', async () => {
			const mockAuthModal = {
				open: jest.fn(),
				showDeviceCodeInstructions: jest.fn(),
				showSuccess: jest.fn()
			};
			const mockAuthManager = {
				initialize: jest.fn().mockResolvedValue(void 0),
				authenticate: jest.fn().mockResolvedValue({
					accessToken: 'test-token',
					expiresOn: new Date(Date.now() + 3600000)
				})
			};
			const mockPluginSettings = {
				getCurrentSettings: jest.fn().mockReturnValue({ clientId: 'test-client-id' }),
				getClientConfig: jest.fn().mockReturnValue({ clientId: 'test-client-id', tenantId: 'common' }),
				updateSetting: jest.fn(),
				saveSettings: jest.fn().mockResolvedValue(void 0)
			};
			const mockTodoApiClient = {
				initialize: jest.fn(),
				getOrCreateTaskList: jest.fn().mockResolvedValue('list-id')
			};

			jest.doMock('../src/ui/authentication-modal', () => ({
				AuthenticationModal: jest.fn().mockImplementation(() => mockAuthModal)
			}));

			(plugin as any).authManager = mockAuthManager;
			(plugin as any).pluginSettings = mockPluginSettings;
			(plugin as any).todoApiClient = mockTodoApiClient;
			jest.spyOn(plugin as any, 'fetchUserInfo').mockResolvedValue(void 0);
			jest.spyOn(plugin as any, 'startAutoSync').mockImplementation();

			await (plugin as any).authenticateWithMicrosoft();

			expect(mockAuthModal.open).toHaveBeenCalled();
			expect(mockAuthManager.initialize).toHaveBeenCalledWith('test-client-id', 'common');
			expect(mockAuthManager.authenticate).toHaveBeenCalled();
			expect(mockTodoApiClient.initialize).toHaveBeenCalledWith('test-token');
			expect(mockAuthModal.showSuccess).toHaveBeenCalled();
		});

		it('should handle authentication errors', async () => {
			const mockAuthModal = {
				open: jest.fn(),
				showError: jest.fn()
			};
			const mockAuthManager = {
				initialize: jest.fn().mockRejectedValue(new Error('Auth error'))
			};
			const mockPluginSettings = {
				getCurrentSettings: jest.fn().mockReturnValue({ clientId: 'test-client-id' }),
				getClientConfig: jest.fn().mockReturnValue({ clientId: 'test-client-id', tenantId: 'common' })
			};
			const mockLogger = {
				error: jest.fn()
			};
			const mockErrorHandler = {
				handleApiError: jest.fn().mockReturnValue('User friendly error')
			};

			jest.doMock('../src/ui/authentication-modal', () => ({
				AuthenticationModal: jest.fn().mockImplementation(() => mockAuthModal)
			}));

			(plugin as any).authManager = mockAuthManager;
			(plugin as any).pluginSettings = mockPluginSettings;
			(plugin as any).logger = mockLogger;
			(plugin as any).errorHandler = mockErrorHandler;

			await (plugin as any).authenticateWithMicrosoft();

			expect(mockAuthModal.showError).toHaveBeenCalledWith('User friendly error');
			expect(mockLogger.error).toHaveBeenCalledWith('Authentication failed', expect.any(Error));
		});
	});

	describe('Manual Sync', () => {
		it('should perform sync when authenticated', async () => {
			const mockPluginSettings = {
				isAuthenticated: jest.fn().mockReturnValue(true)
			};
			const mockTodoApiClient = {
				isInitialized: jest.fn().mockReturnValue(true)
			};
			const mockTodoSynchronizer = {
				performFullSync: jest.fn().mockResolvedValue({
					success: true,
					newTasksFromMsft: 2,
					newTasksFromObsidian: 1,
					completedTasks: 3,
					errors: []
				})
			};
			const mockLogger = {
				info: jest.fn()
			};

			(plugin as any).pluginSettings = mockPluginSettings;
			(plugin as any).todoApiClient = mockTodoApiClient;
			(plugin as any).todoSynchronizer = mockTodoSynchronizer;
			(plugin as any).logger = mockLogger;

			await (plugin as any).performManualSync();

			expect(mockTodoSynchronizer.performFullSync).toHaveBeenCalled();
			expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('同期完了'));
		});

		it('should handle sync when not authenticated', async () => {
			const mockPluginSettings = {
				isAuthenticated: jest.fn().mockReturnValue(false)
			};

			(plugin as any).pluginSettings = mockPluginSettings;

			await (plugin as any).performManualSync();

			// Should show notice about authentication requirement
			expect(require('obsidian').Notice).toHaveBeenCalledWith(
				expect.stringContaining('認証が必要です')
			);
		});

		it('should handle sync errors', async () => {
			const mockPluginSettings = {
				isAuthenticated: jest.fn().mockReturnValue(true)
			};
			const mockTodoApiClient = {
				isInitialized: jest.fn().mockReturnValue(true)
			};
			const mockTodoSynchronizer = {
				performFullSync: jest.fn().mockRejectedValue(new Error('Sync error'))
			};
			const mockLogger = {
				info: jest.fn(),
				error: jest.fn()
			};
			const mockErrorHandler = {
				handleApiError: jest.fn().mockReturnValue('Sync failed')
			};

			(plugin as any).pluginSettings = mockPluginSettings;
			(plugin as any).todoApiClient = mockTodoApiClient;
			(plugin as any).todoSynchronizer = mockTodoSynchronizer;
			(plugin as any).logger = mockLogger;
			(plugin as any).errorHandler = mockErrorHandler;

			await (plugin as any).performManualSync();

			expect(mockLogger.error).toHaveBeenCalledWith('Manual sync failed', expect.any(Error));
		});
	});

	describe('Auto Sync', () => {
		it('should start auto sync when enabled', () => {
			const mockPluginSettings = {
				getCurrentSettings: jest.fn().mockReturnValue({
					autoSync: true,
					syncInterval: 300000
				})
			};
			const mockTodoSynchronizer = {
				performFullSync: jest.fn().mockResolvedValue({})
			};

			(plugin as any).pluginSettings = mockPluginSettings;
			(plugin as any).todoSynchronizer = mockTodoSynchronizer;
			jest.spyOn(plugin as any, 'stopAutoSync').mockImplementation();

			(plugin as any).startAutoSync();

			expect((plugin as any).autoSyncInterval).toBeTruthy();
		});

		it('should stop auto sync', () => {
			const mockInterval = setTimeout(() => {}, 1000);
			(plugin as any).autoSyncInterval = mockInterval;

			(plugin as any).stopAutoSync();

			expect((plugin as any).autoSyncInterval).toBeNull();
		});
	});

	describe('Account Disconnection', () => {
		it('should disconnect account successfully', async () => {
			const mockAuthManager = {
				logout: jest.fn().mockResolvedValue(void 0)
			};
			const mockPluginSettings = {
				clearAuthenticationData: jest.fn(),
				saveSettings: jest.fn().mockResolvedValue(void 0),
				getCurrentSettings: jest.fn().mockReturnValue({})
			};
			const mockLogger = {
				info: jest.fn()
			};

			(plugin as any).authManager = mockAuthManager;
			(plugin as any).pluginSettings = mockPluginSettings;
			(plugin as any).logger = mockLogger;
			jest.spyOn(plugin as any, 'stopAutoSync').mockImplementation();

			await (plugin as any).disconnectAccount();

			expect(mockAuthManager.logout).toHaveBeenCalled();
			expect(mockPluginSettings.clearAuthenticationData).toHaveBeenCalled();
			expect(mockLogger.info).toHaveBeenCalledWith('Account disconnected');
		});
	});
});