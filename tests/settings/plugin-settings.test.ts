import { PluginSettings } from '../../src/settings/plugin-settings';
import { Logger } from '../../src/utils/logger';
import { ErrorHandler } from '../../src/utils/error-handler';
import { DEFAULT_SETTINGS } from '../../src/types';

// No moment dependency needed

describe('PluginSettings', () => {
	let pluginSettings: PluginSettings;
	let logger: Logger;
	let errorHandler: ErrorHandler;
	let mockLoadData: jest.Mock;
	let mockSaveData: jest.Mock;

	beforeEach(() => {
		logger = new Logger('error');
		errorHandler = new ErrorHandler(logger);
		mockLoadData = jest.fn();
		mockSaveData = jest.fn();

		pluginSettings = new PluginSettings(
			logger,
			errorHandler,
			mockLoadData,
			mockSaveData
		);

		// Mock console methods
		jest.spyOn(console, 'error').mockImplementation();
		jest.spyOn(console, 'debug').mockImplementation();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('loadSettings', () => {
		it('should load and merge settings with defaults', async () => {
			const savedData = {
				clientId: 'test-client-id',
				dailyNotePath: 'Custom Notes'
			};
			mockLoadData.mockResolvedValue(savedData);

			const result = await pluginSettings.loadSettings();

			expect(result.clientId).toBe('test-client-id');
			expect(result.dailyNotePath).toBe('Custom Notes');
			expect(result.tenantId).toBe(DEFAULT_SETTINGS.tenantId); // Should use default
		});

		it('should return defaults when load fails', async () => {
			mockLoadData.mockRejectedValue(new Error('Load failed'));

			const result = await pluginSettings.loadSettings();

			expect(result).toEqual(DEFAULT_SETTINGS);
		});
	});

	describe('saveSettings', () => {
		it('should validate and save settings', async () => {
			const settings = {
				...DEFAULT_SETTINGS,
				clientId: 'valid-client-id'
			};
			mockSaveData.mockResolvedValue(undefined);

			await pluginSettings.saveSettings(settings);

			expect(mockSaveData).toHaveBeenCalledWith(settings);
		});

		it('should throw error when validation fails', async () => {
			const invalidSettings = {
				...DEFAULT_SETTINGS,
				clientId: '' // Invalid empty client ID
			};

			await expect(pluginSettings.saveSettings(invalidSettings))
				.rejects.toThrow('Client ID is required');
		});

		it('should throw error when save fails', async () => {
			const settings = {
				...DEFAULT_SETTINGS,
				clientId: 'valid-client-id'
			};
			mockSaveData.mockRejectedValue(new Error('Save failed'));

			await expect(pluginSettings.saveSettings(settings))
				.rejects.toThrow('Failed to save settings');
		});
	});

	describe('validateSettings', () => {
		it('should validate client ID requirement', () => {
			const settings = { ...DEFAULT_SETTINGS, clientId: '' };

			expect(() => pluginSettings.validateSettings(settings))
				.toThrow('Client ID is required');
		});

		it('should set default tenant ID when empty', () => {
			const settings = { ...DEFAULT_SETTINGS, clientId: 'valid', tenantId: '' };

			const result = pluginSettings.validateSettings(settings);

			expect(result.tenantId).toBe('common');
		});

		it('should validate daily note path', () => {
			const settings = { ...DEFAULT_SETTINGS, clientId: 'valid', dailyNotePath: '' };

			expect(() => pluginSettings.validateSettings(settings))
				.toThrow('Invalid Daily Note path');
		});

		it('should validate date format', () => {
			const settings = { ...DEFAULT_SETTINGS, clientId: 'valid', dateFormat: 'invalid' };

			expect(() => pluginSettings.validateSettings(settings))
				.toThrow('Invalid date format');
		});

		it('should adjust sync interval to minimum', () => {
			const settings = { ...DEFAULT_SETTINGS, clientId: 'valid', syncInterval: 30000 };

			const result = pluginSettings.validateSettings(settings);

			expect(result.syncInterval).toBe(60000); // Minimum 1 minute
		});

		it('should validate log level', () => {
			const settings = { ...DEFAULT_SETTINGS, clientId: 'valid', logLevel: 'invalid' as any };

			const result = pluginSettings.validateSettings(settings);

			expect(result.logLevel).toBe('info');
		});
	});

	describe('validateDailyNotePath', () => {
		it('should accept valid paths', () => {
			expect(pluginSettings.validateDailyNotePath('Daily Notes')).toBe(true);
			expect(pluginSettings.validateDailyNotePath('Notes/Daily')).toBe(true);
			expect(pluginSettings.validateDailyNotePath('my-notes')).toBe(true);
		});

		it('should reject invalid paths', () => {
			expect(pluginSettings.validateDailyNotePath('')).toBe(false);
			expect(pluginSettings.validateDailyNotePath('  ')).toBe(false);
			expect(pluginSettings.validateDailyNotePath('invalid<path')).toBe(false);
			expect(pluginSettings.validateDailyNotePath('invalid>path')).toBe(false);
			expect(pluginSettings.validateDailyNotePath(' leading-space')).toBe(false);
			expect(pluginSettings.validateDailyNotePath('trailing-space ')).toBe(false);
		});
	});

	describe('validateDateFormat', () => {
		it('should accept valid date formats', () => {
			expect(pluginSettings.validateDateFormat('YYYY-MM-DD')).toBe(true);
			expect(pluginSettings.validateDateFormat('DD/MM/YYYY')).toBe(true);
			expect(pluginSettings.validateDateFormat('MMM DD, YYYY')).toBe(true);
		});

		it('should reject invalid date formats', () => {
			expect(pluginSettings.validateDateFormat('')).toBe(false);
			expect(pluginSettings.validateDateFormat('invalid')).toBe(false);
			expect(pluginSettings.validateDateFormat('XXXX-XX-XX')).toBe(false);
		});
	});

	describe('getCurrentSettings', () => {
		it('should return a copy of current settings', () => {
			const settings = pluginSettings.getCurrentSettings();

			expect(settings).toEqual(DEFAULT_SETTINGS);
			expect(settings).not.toBe(DEFAULT_SETTINGS); // Should be a copy
		});
	});

	describe('updateSetting', () => {
		it('should update a single setting', () => {
			pluginSettings.updateSetting('clientId', 'new-client-id');

			const settings = pluginSettings.getCurrentSettings();
			expect(settings.clientId).toBe('new-client-id');
		});
	});

	describe('isAuthenticated', () => {
		it('should return true when authenticated with valid token', () => {
			pluginSettings.updateSetting('accessToken', 'valid-token');
			pluginSettings.updateSetting('tokenExpiry', Date.now() + 3600000); // 1 hour from now

			expect(pluginSettings.isAuthenticated()).toBe(true);
		});

		it('should return false when token is expired', () => {
			pluginSettings.updateSetting('accessToken', 'valid-token');
			pluginSettings.updateSetting('tokenExpiry', Date.now() - 3600000); // 1 hour ago

			expect(pluginSettings.isAuthenticated()).toBe(false);
		});

		it('should return false when no token', () => {
			expect(pluginSettings.isAuthenticated()).toBe(false);
		});
	});

	describe('clearAuthenticationData', () => {
		it('should clear all authentication-related data', () => {
			pluginSettings.updateSetting('accessToken', 'token');
			pluginSettings.updateSetting('refreshToken', 'refresh');
			pluginSettings.updateSetting('userEmail', 'user@example.com');
			pluginSettings.updateSetting('userName', 'User Name');

			pluginSettings.clearAuthenticationData();

			const settings = pluginSettings.getCurrentSettings();
			expect(settings.accessToken).toBe('');
			expect(settings.refreshToken).toBe('');
			expect(settings.userEmail).toBe('');
			expect(settings.userName).toBe('');
			expect(settings.tokenExpiry).toBe(0);
		});
	});

	describe('getClientConfig', () => {
		it('should return client configuration', () => {
			pluginSettings.updateSetting('clientId', 'test-client');
			pluginSettings.updateSetting('tenantId', 'test-tenant');

			const config = pluginSettings.getClientConfig();

			expect(config).toEqual({
				clientId: 'test-client',
				tenantId: 'test-tenant'
			});
		});
	});

	describe('getDailyNoteConfig', () => {
		it('should return daily note configuration', () => {
			pluginSettings.updateSetting('dailyNotePath', 'Custom Notes');
			pluginSettings.updateSetting('dateFormat', 'DD-MM-YYYY');
			pluginSettings.updateSetting('todoSectionHeader', '## Tasks');

			const config = pluginSettings.getDailyNoteConfig();

			expect(config).toEqual({
				dailyNotePath: 'Custom Notes',
				dateFormat: 'DD-MM-YYYY',
				todoSectionHeader: '## Tasks'
			});
		});
	});

	describe('getSyncConfig', () => {
		it('should return sync configuration', () => {
			pluginSettings.updateSetting('syncInterval', 600000);
			pluginSettings.updateSetting('autoSync', false);

			const config = pluginSettings.getSyncConfig();

			expect(config).toEqual({
				syncInterval: 600000,
				autoSync: false
			});
		});
	});
});