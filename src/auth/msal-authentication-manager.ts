import { PublicClientApplication, AuthenticationResult } from '@azure/msal-node';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';
import { getAzureConfig } from '../config/app-config';

export class MSALAuthenticationManager {
	private msalClient: PublicClientApplication | null = null;
	private logger: Logger;
	private errorHandler: ErrorHandler;

	constructor(logger: Logger, errorHandler: ErrorHandler) {
		this.logger = logger;
		this.errorHandler = errorHandler;
	}

	async initialize(): Promise<void> {
		try {
			const config = getAzureConfig();
			this.msalClient = new PublicClientApplication({
				auth: {
					clientId: config.CLIENT_ID,
					authority: `https://login.microsoftonline.com/${config.TENANT_ID}`
				},
				system: {
					loggerOptions: {
						loggerCallback: (level, message, containsPii) => {
							if (containsPii) return;
							this.logger.debug(`MSAL [${level}]: ${message}`);
						},
						piiLoggingEnabled: false,
						logLevel: 3 // Info level
					}
				}
			});

			this.logger.info('MSAL client initialized successfully');
		} catch (error) {
			const errorMessage = this.errorHandler.handleApiError(error);
			throw new Error(`MSAL initialization failed: ${errorMessage}`);
		}
	}

	async authenticate(deviceCodeCallback?: (userCode: string, verificationUri: string) => void): Promise<AuthenticationResult> {
		if (!this.msalClient) {
			throw new Error('MSAL client not initialized');
		}

		try {
			this.logger.info('Starting authentication process');

			// Try silent authentication first
			const accounts = await this.msalClient.getAllAccounts();
			if (accounts.length > 0) {
				try {
					const silentResult = await this.msalClient.acquireTokenSilent({
						scopes: ['https://graph.microsoft.com/Tasks.ReadWrite'],
						account: accounts[0]
					});
					
					this.logger.info('Silent authentication successful');
					return silentResult;
				} catch (silentError) {
					this.logger.debug('Silent authentication failed, proceeding with device code flow');
				}
			}

			// Device code flow
			const deviceCodeRequest = {
				scopes: ['https://graph.microsoft.com/Tasks.ReadWrite'],
				deviceCodeCallback: (response: any) => {
					this.logger.info(`Device code: ${response.userCode}`);
					this.logger.info(`Verification URL: ${response.verificationUri}`);
					
					// Call the provided callback for UI integration
					if (deviceCodeCallback) {
						deviceCodeCallback(response.userCode, response.verificationUri);
					}
				}
			};

			const authResult = await this.msalClient.acquireTokenByDeviceCode(deviceCodeRequest);
			if (!authResult) {
				throw new Error('Authentication result is null');
			}
			this.logger.info('Device code authentication successful');
			
			return authResult;
		} catch (error) {
			const errorMessage = this.errorHandler.handleApiError(error);
			throw new Error(`Authentication failed: ${errorMessage}`);
		}
	}

	async getAccessToken(): Promise<string> {
		if (!this.msalClient) {
			throw new Error('MSAL client not initialized');
		}

		try {
			const accounts = await this.msalClient.getAllAccounts();
			if (accounts.length === 0) {
				throw new Error('No accounts found. Please authenticate first.');
			}

			const silentResult = await this.msalClient.acquireTokenSilent({
				scopes: ['https://graph.microsoft.com/Tasks.ReadWrite'],
				account: accounts[0]
			});

			return silentResult.accessToken;
		} catch (error) {
			// If silent token acquisition fails, token might be expired
			this.logger.debug('Token refresh failed, re-authentication required');
			throw new Error('Token expired. Re-authentication required.');
		}
	}

	async logout(): Promise<void> {
		if (!this.msalClient) {
			return;
		}

		try {
			const accounts = await this.msalClient.getAllAccounts();
			// Note: removeAccount may not be available in all MSAL versions
			// This is a placeholder for proper logout implementation
			this.logger.info('Logout successful');
		} catch (error) {
			this.errorHandler.logError('Logout failed', 'Auth', error);
		}
	}

	async isAuthenticated(): Promise<boolean> {
		if (!this.msalClient) {
			return false;
		}

		try {
			const accounts = await this.msalClient.getAllAccounts();
			return accounts.length > 0;
		} catch (error) {
			this.logger.debug('Authentication check failed');
			return false;
		}
	}
}