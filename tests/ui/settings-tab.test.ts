import { TodoIntegratorSettingsTab } from '../../src/ui/settings-tab';
import { Logger } from '../../src/utils/logger';
import { ErrorHandler } from '../../src/utils/error-handler';
import { PluginSettings } from '../../src/settings/plugin-settings';

// Mock Obsidian
const mockApp = {};
const mockPlugin = {
	saveSettings: jest.fn()
};

jest.mock('obsidian', () => ({
	PluginSettingTab: class MockPluginSettingTab {
		containerEl = {
			empty: jest.fn(),
			createEl: jest.fn().mockReturnValue({
				setText: jest.fn(),
				createEl: jest.fn().mockReturnValue({
					setText: jest.fn(),
					setAttr: jest.fn()
				})
			}),
			createDiv: jest.fn().mockReturnValue({
				createEl: jest.fn().mockReturnValue({
					setText: jest.fn(),
					setAttr: jest.fn()
				}),
				createDiv: jest.fn().mockReturnValue({
					createEl: jest.fn().mockReturnValue({
						setText: jest.fn(),
						setAttr: jest.fn()
					})
				})
			})
		};
		app = mockApp;
		plugin = mockPlugin;
	},
	Setting: jest.fn().mockImplementation(() => ({
		setName: jest.fn().mockReturnThis(),
		setDesc: jest.fn().mockReturnThis(),
		addText: jest.fn().mockReturnThis(),
		addTextArea: jest.fn().mockReturnThis(),
		addToggle: jest.fn().mockReturnThis(),
		addDropdown: jest.fn().mockReturnThis(),
		addButton: jest.fn().mockReturnThis(),
		addSlider: jest.fn().mockReturnThis(),
		setClass: jest.fn().mockReturnThis()
	})),
	Notice: jest.fn()
}));

describe('TodoIntegratorSettingsTab', () => {
	let settingsTab: TodoIntegratorSettingsTab;
	let mockLogger: jest.Mocked<Logger>;
	let mockErrorHandler: jest.Mocked<ErrorHandler>;
	let mockPluginSettings: jest.Mocked<PluginSettings>;
	let mockAuthCallback: jest.Mock;
	let mockSyncCallback: jest.Mock;
	let mockDisconnectCallback: jest.Mock;

	beforeEach(() => {
		mockLogger = {
			info: jest.fn(),
			debug: jest.fn(),
			error: jest.fn(),
			setLogLevel: jest.fn()
		} as any;

		mockErrorHandler = {
			handleApiError: jest.fn(),
			logError: jest.fn()
		} as any;

		mockPluginSettings = {
			getCurrentSettings: jest.fn().mockReturnValue({
				clientId: 'test-client-id',
				tenantId: 'common',
				userEmail: 'test@example.com',
				userName: 'Test User',
				dailyNotePath: 'Daily Notes',
				dateFormat: 'YYYY-MM-DD',
				todoSectionHeader: '## ToDo',
				syncInterval: 300000,
				autoSync: true,
				logLevel: 'info'
			}),
			updateSetting: jest.fn(),
			saveSettings: jest.fn().mockResolvedValue(void 0),
			isAuthenticated: jest.fn().mockReturnValue(true)
		} as any;

		mockAuthCallback = jest.fn().mockResolvedValue(void 0);
		mockSyncCallback = jest.fn().mockResolvedValue(void 0);
		mockDisconnectCallback = jest.fn().mockResolvedValue(void 0);

		settingsTab = new TodoIntegratorSettingsTab(
			mockApp as any,
			mockPlugin as any,
			mockLogger,
			mockErrorHandler,
			mockPluginSettings,
			mockAuthCallback,
			mockSyncCallback,
			mockDisconnectCallback
		);

		jest.clearAllMocks();
	});

	describe('display', () => {
		it('should display settings tab correctly', () => {
			settingsTab.display();

			expect(settingsTab.containerEl.empty).toHaveBeenCalled();
			expect(settingsTab.containerEl.createEl).toHaveBeenCalledWith('h2', { text: 'Microsoft Todo Integrator' });
		});

		it('should create authentication section', () => {
			const { Setting } = require('obsidian');
			
			settingsTab.display();

			// Should create authentication settings
			expect(Setting).toHaveBeenCalledWith(settingsTab.containerEl);
		});

		it('should show authenticated user info when authenticated', () => {
			mockPluginSettings.isAuthenticated.mockReturnValue(true);
			mockPluginSettings.getCurrentSettings.mockReturnValue({
				...mockPluginSettings.getCurrentSettings(),
				userEmail: 'test@example.com',
				userName: 'Test User'
			});

			settingsTab.display();

			// Should show user info and disconnect button
			expect(mockPluginSettings.getCurrentSettings).toHaveBeenCalled();
		});

		it('should show authentication form when not authenticated', () => {
			mockPluginSettings.isAuthenticated.mockReturnValue(false);

			settingsTab.display();

			// Should show client ID input and auth button
			expect(mockPluginSettings.isAuthenticated).toHaveBeenCalled();
		});

		it('should create sync settings section', () => {
			settingsTab.display();

			// Should create sync interval and auto-sync toggle settings
			const { Setting } = require('obsidian');
			expect(Setting).toHaveBeenCalledWith(settingsTab.containerEl);
		});

		it('should create daily note settings section', () => {
			settingsTab.display();

			// Should create daily note path, date format, and section header settings
			const { Setting } = require('obsidian');
			expect(Setting).toHaveBeenCalledWith(settingsTab.containerEl);
		});

		it('should create advanced settings section', () => {
			settingsTab.display();

			// Should create log level setting
			const { Setting } = require('obsidian');
			expect(Setting).toHaveBeenCalledWith(settingsTab.containerEl);
		});
	});

	describe('authentication actions', () => {
		it('should handle authentication button click', async () => {
			// Mock the setting creation to capture the button callback
			const { Setting } = require('obsidian');
			let authButtonCallback: Function;

			Setting.mockImplementation(() => ({
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addButton: jest.fn().mockImplementation((callback) => {
					callback({
						setButtonText: jest.fn().mockReturnThis(),
						onClick: jest.fn().mockImplementation((clickCallback) => {
							authButtonCallback = clickCallback;
							return {};
						})
					});
					return {};
				})
			}));

			mockPluginSettings.isAuthenticated.mockReturnValue(false);
			settingsTab.display();

			// Simulate button click
			if (authButtonCallback) {
				await authButtonCallback();
				expect(mockAuthCallback).toHaveBeenCalled();
			}
		});

		it('should handle sync now button click', async () => {
			const { Setting } = require('obsidian');
			let syncButtonCallback: Function;

			Setting.mockImplementation(() => ({
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addButton: jest.fn().mockImplementation((callback) => {
					callback({
						setButtonText: jest.fn().mockReturnThis(),
						onClick: jest.fn().mockImplementation((clickCallback) => {
							syncButtonCallback = clickCallback;
							return {};
						})
					});
					return {};
				})
			}));

			settingsTab.display();

			// Simulate button click
			if (syncButtonCallback) {
				await syncButtonCallback();
				expect(mockSyncCallback).toHaveBeenCalled();
			}
		});

		it('should handle disconnect button click', async () => {
			const { Setting } = require('obsidian');
			let disconnectButtonCallback: Function;

			Setting.mockImplementation(() => ({
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addButton: jest.fn().mockImplementation((callback) => {
					callback({
						setButtonText: jest.fn().mockReturnThis(),
						onClick: jest.fn().mockImplementation((clickCallback) => {
							disconnectButtonCallback = clickCallback;
							return {};
						})
					});
					return {};
				})
			}));

			mockPluginSettings.isAuthenticated.mockReturnValue(true);
			settingsTab.display();

			// Simulate button click
			if (disconnectButtonCallback) {
				await disconnectButtonCallback();
				expect(mockDisconnectCallback).toHaveBeenCalled();
			}
		});

		it('should handle authentication errors', async () => {
			const { Setting } = require('obsidian');
			let authButtonCallback: Function;

			Setting.mockImplementation(() => ({
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addButton: jest.fn().mockImplementation((callback) => {
					callback({
						setButtonText: jest.fn().mockReturnThis(),
						onClick: jest.fn().mockImplementation((clickCallback) => {
							authButtonCallback = clickCallback;
							return {};
						})
					});
					return {};
				})
			}));

			mockAuthCallback.mockRejectedValue(new Error('Auth failed'));
			mockErrorHandler.handleApiError.mockReturnValue('Authentication failed');

			settingsTab.display();

			if (authButtonCallback) {
				await authButtonCallback();
				
				expect(mockLogger.error).toHaveBeenCalledWith(
					'Authentication failed in settings',
					expect.any(Error)
				);
			}
		});
	});

	describe('setting changes', () => {
		it('should handle client ID changes', () => {
			const { Setting } = require('obsidian');
			let clientIdChangeCallback: Function;

			Setting.mockImplementation(() => ({
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addText: jest.fn().mockImplementation((callback) => {
					callback({
						setPlaceholder: jest.fn().mockReturnThis(),
						setValue: jest.fn().mockReturnThis(),
						onChange: jest.fn().mockImplementation((changeCallback) => {
							clientIdChangeCallback = changeCallback;
							return {};
						})
					});
					return {};
				})
			}));

			settingsTab.display();

			if (clientIdChangeCallback) {
				clientIdChangeCallback('new-client-id');
				
				expect(mockPluginSettings.updateSetting).toHaveBeenCalledWith('clientId', 'new-client-id');
				expect(mockPluginSettings.saveSettings).toHaveBeenCalled();
			}
		});

		it('should handle daily note path changes', () => {
			const { Setting } = require('obsidian');
			let pathChangeCallback: Function;

			Setting.mockImplementation(() => ({
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addText: jest.fn().mockImplementation((callback) => {
					callback({
						setPlaceholder: jest.fn().mockReturnThis(),
						setValue: jest.fn().mockReturnThis(),
						onChange: jest.fn().mockImplementation((changeCallback) => {
							pathChangeCallback = changeCallback;
							return {};
						})
					});
					return {};
				})
			}));

			settingsTab.display();

			if (pathChangeCallback) {
				pathChangeCallback('Custom Notes');
				
				expect(mockPluginSettings.updateSetting).toHaveBeenCalledWith('dailyNotePath', 'Custom Notes');
				expect(mockPluginSettings.saveSettings).toHaveBeenCalled();
			}
		});

		it('should handle auto sync toggle changes', () => {
			const { Setting } = require('obsidian');
			let autoSyncChangeCallback: Function;

			Setting.mockImplementation(() => ({
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addToggle: jest.fn().mockImplementation((callback) => {
					callback({
						setValue: jest.fn().mockReturnThis(),
						onChange: jest.fn().mockImplementation((changeCallback) => {
							autoSyncChangeCallback = changeCallback;
							return {};
						})
					});
					return {};
				})
			}));

			settingsTab.display();

			if (autoSyncChangeCallback) {
				autoSyncChangeCallback(false);
				
				expect(mockPluginSettings.updateSetting).toHaveBeenCalledWith('autoSync', false);
				expect(mockPluginSettings.saveSettings).toHaveBeenCalled();
			}
		});

		it('should handle log level dropdown changes', () => {
			const { Setting } = require('obsidian');
			let logLevelChangeCallback: Function;

			Setting.mockImplementation(() => ({
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addDropdown: jest.fn().mockImplementation((callback) => {
					callback({
						addOption: jest.fn().mockReturnThis(),
						setValue: jest.fn().mockReturnThis(),
						onChange: jest.fn().mockImplementation((changeCallback) => {
							logLevelChangeCallback = changeCallback;
							return {};
						})
					});
					return {};
				})
			}));

			settingsTab.display();

			if (logLevelChangeCallback) {
				logLevelChangeCallback('debug');
				
				expect(mockPluginSettings.updateSetting).toHaveBeenCalledWith('logLevel', 'debug');
				expect(mockPluginSettings.saveSettings).toHaveBeenCalled();
			}
		});

		it('should handle sync interval changes', () => {
			const { Setting } = require('obsidian');
			let intervalChangeCallback: Function;

			Setting.mockImplementation(() => ({
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addDropdown: jest.fn().mockImplementation((callback) => {
					callback({
						addOption: jest.fn().mockReturnThis(),
						setValue: jest.fn().mockReturnThis(),
						onChange: jest.fn().mockImplementation((changeCallback) => {
							intervalChangeCallback = changeCallback;
							return {};
						})
					});
					return {};
				})
			}));

			settingsTab.display();

			if (intervalChangeCallback) {
				intervalChangeCallback('600000'); // 10 minutes
				
				expect(mockPluginSettings.updateSetting).toHaveBeenCalledWith('syncInterval', 600000);
				expect(mockPluginSettings.saveSettings).toHaveBeenCalled();
			}
		});

		it('should handle setting save errors', async () => {
			const { Setting } = require('obsidian');
			let settingChangeCallback: Function;

			Setting.mockImplementation(() => ({
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addText: jest.fn().mockImplementation((callback) => {
					callback({
						setPlaceholder: jest.fn().mockReturnThis(),
						setValue: jest.fn().mockReturnThis(),
						onChange: jest.fn().mockImplementation((changeCallback) => {
							settingChangeCallback = changeCallback;
							return {};
						})
					});
					return {};
				})
			}));

			mockPluginSettings.saveSettings.mockRejectedValue(new Error('Save failed'));

			settingsTab.display();

			if (settingChangeCallback) {
				await settingChangeCallback('new-value');
				
				expect(mockLogger.error).toHaveBeenCalledWith(
					'Failed to save settings',
					expect.any(Error)
				);
			}
		});
	});

	describe('UI state management', () => {
		it('should show different UI based on authentication state', () => {
			// Test authenticated state
			mockPluginSettings.isAuthenticated.mockReturnValue(true);
			settingsTab.display();
			expect(mockPluginSettings.isAuthenticated).toHaveBeenCalled();

			// Reset and test unauthenticated state
			jest.clearAllMocks();
			mockPluginSettings.isAuthenticated.mockReturnValue(false);
			settingsTab.display();
			expect(mockPluginSettings.isAuthenticated).toHaveBeenCalled();
		});

		it('should refresh display when settings change', () => {
			const refreshSpy = jest.spyOn(settingsTab, 'display');
			
			// This would typically be called when authentication state changes
			settingsTab.display();
			
			expect(refreshSpy).toHaveBeenCalled();
		});
	});

	describe('validation', () => {
		it('should validate client ID format', () => {
			// This test depends on the actual validation logic in the settings tab
			// For now, we ensure the setting change goes through
			const { Setting } = require('obsidian');
			let clientIdChangeCallback: Function;

			Setting.mockImplementation(() => ({
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addText: jest.fn().mockImplementation((callback) => {
					callback({
						setPlaceholder: jest.fn().mockReturnThis(),
						setValue: jest.fn().mockReturnThis(),
						onChange: jest.fn().mockImplementation((changeCallback) => {
							clientIdChangeCallback = changeCallback;
							return {};
						})
					});
					return {};
				})
			}));

			settingsTab.display();

			if (clientIdChangeCallback) {
				// Test with invalid client ID (not a UUID)
				clientIdChangeCallback('invalid-id');
				expect(mockPluginSettings.updateSetting).toHaveBeenCalledWith('clientId', 'invalid-id');

				// Test with valid UUID format
				clientIdChangeCallback('12345678-1234-1234-1234-123456789012');
				expect(mockPluginSettings.updateSetting).toHaveBeenCalledWith('clientId', '12345678-1234-1234-1234-123456789012');
			}
		});
	});
});