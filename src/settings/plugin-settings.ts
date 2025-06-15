import { TodoIntegratorSettings, DEFAULT_SETTINGS } from '../types';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';
// Date handling utilities

export class PluginSettings {
	private settings: TodoIntegratorSettings;
	private logger: Logger;
	private errorHandler: ErrorHandler;
	private loadDataCallback: () => Promise<any>;
	private saveDataCallback: (data: any) => Promise<void>;

	constructor(
		logger: Logger,
		errorHandler: ErrorHandler,
		loadDataCallback: () => Promise<any>,
		saveDataCallback: (data: any) => Promise<void>
	) {
		this.settings = { ...DEFAULT_SETTINGS };
		this.logger = logger;
		this.errorHandler = errorHandler;
		this.loadDataCallback = loadDataCallback;
		this.saveDataCallback = saveDataCallback;
	}

	async loadSettings(): Promise<TodoIntegratorSettings> {
		try {
			const data = await this.loadDataCallback();
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
			this.logger.debug('Settings loaded successfully');
			return this.settings;
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			this.logger.error(`Failed to load settings: ${errorMessage}`, error);
			this.settings = { ...DEFAULT_SETTINGS };
			return this.settings;
		}
	}

	async saveSettings(settings: TodoIntegratorSettings): Promise<void> {
		try {
			const validatedSettings = this.validateSettings(settings);
			this.settings = validatedSettings;
			await this.saveDataCallback(this.settings);
			this.logger.debug('Settings saved successfully');
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			this.logger.error(`Failed to save settings: ${errorMessage}`, error);
			throw new Error(`Failed to save settings: ${errorMessage}`);
		}
	}

	validateSettings(settings: TodoIntegratorSettings): TodoIntegratorSettings {
		const validated = { ...settings };

		// Validate Daily Note path
		if (!this.validateDailyNotePath(validated.dailyNotePath)) {
			throw new Error('Invalid Daily Note path');
		}

		// Validate date format
		if (!this.validateDateFormat(validated.dateFormat)) {
			throw new Error('Invalid date format');
		}

		// Validate sync interval (minimum 1 minute)
		if (validated.syncInterval < 60000) {
			validated.syncInterval = 60000;
			this.logger.info('Sync interval adjusted to minimum 1 minute');
		}

		// Validate log level
		if (!['debug', 'info', 'error'].includes(validated.logLevel)) {
			validated.logLevel = 'info';
		}

		return validated;
	}

	getDefaultSettings(): TodoIntegratorSettings {
		return { ...DEFAULT_SETTINGS };
	}

	validateDailyNotePath(path: string): boolean {
		if (!path || path.trim().length === 0) {
			return false;
		}

		// Check for invalid characters
		const invalidChars = /[<>:"|?*]/;
		if (invalidChars.test(path)) {
			return false;
		}

		// Path should not start or end with spaces
		if (path !== path.trim()) {
			return false;
		}

		return true;
	}

	validateDateFormat(format: string): boolean {
		if (!format || format.trim().length === 0) {
			return false;
		}

		// Simple validation for common date formats
		const validFormats = [
			'YYYY-MM-DD',
			'DD/MM/YYYY',
			'MM/DD/YYYY',
			'MMM DD, YYYY',
			'DD MMM YYYY',
			'YYYY/MM/DD'
		];

		return validFormats.includes(format);
	}

	getCurrentSettings(): TodoIntegratorSettings {
		return { ...this.settings };
	}

	updateSetting<K extends keyof TodoIntegratorSettings>(
		key: K, 
		value: TodoIntegratorSettings[K]
	): void {
		this.settings[key] = value;
	}

	isAuthenticated(): boolean {
		return !!(
			this.settings.accessToken && 
			this.settings.tokenExpiry && 
			Date.now() < this.settings.tokenExpiry
		);
	}

	clearAuthenticationData(): void {
		this.settings.accessToken = '';
		this.settings.refreshToken = '';
		this.settings.tokenExpiry = 0;
		this.settings.userEmail = '';
		this.settings.userName = '';
	}


	getDailyNoteConfig(): { 
		dailyNotePath: string; 
		dateFormat: string; 
		todoSectionHeader: string; 
	} {
		return {
			dailyNotePath: this.settings.dailyNotePath,
			dateFormat: this.settings.dateFormat,
			todoSectionHeader: this.settings.todoSectionHeader
		};
	}

	getSyncConfig(): { syncInterval: number; autoSync: boolean } {
		return {
			syncInterval: this.settings.syncInterval,
			autoSync: this.settings.autoSync
		};
	}
}