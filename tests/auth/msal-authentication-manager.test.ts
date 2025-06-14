import { MSALAuthenticationManager } from '../../src/auth/msal-authentication-manager';
import { Logger } from '../../src/utils/logger';
import { ErrorHandler } from '../../src/utils/error-handler';

// Mock MSAL
const mockMsalClient = {
	getAllAccounts: jest.fn(),
	acquireTokenSilent: jest.fn(),
	acquireTokenByDeviceCode: jest.fn()
};

jest.mock('@azure/msal-node', () => ({
	PublicClientApplication: jest.fn().mockImplementation(() => mockMsalClient)
}));

describe('MSALAuthenticationManager', () => {
	let authManager: MSALAuthenticationManager;
	let mockLogger: jest.Mocked<Logger>;
	let mockErrorHandler: jest.Mocked<ErrorHandler>;

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

		authManager = new MSALAuthenticationManager(mockLogger, mockErrorHandler);
		jest.clearAllMocks();
	});

	describe('initialize', () => {
		it('should initialize MSAL client successfully', async () => {
			await authManager.initialize('test-client-id', 'common');

			expect(mockLogger.info).toHaveBeenCalledWith('MSAL client initialized successfully');
		});

		it('should use default tenant if not provided', async () => {
			await authManager.initialize('test-client-id');

			expect(mockLogger.info).toHaveBeenCalledWith('MSAL client initialized successfully');
		});

		it('should handle initialization errors', async () => {
			const { PublicClientApplication } = require('@azure/msal-node');
			PublicClientApplication.mockImplementationOnce(() => {
				throw new Error('MSAL init error');
			});

			mockErrorHandler.handleApiError.mockReturnValue('Handled error');

			await expect(authManager.initialize('test-client-id')).rejects.toThrow(
				'MSAL initialization failed: Handled error'
			);
		});
	});

	describe('authenticate', () => {
		beforeEach(async () => {
			await authManager.initialize('test-client-id');
		});

		it('should perform silent authentication when account exists', async () => {
			const mockAccount = { homeAccountId: 'test-account' };
			const mockAuthResult = {
				accessToken: 'test-token',
				expiresOn: new Date()
			};

			mockMsalClient.getAllAccounts.mockResolvedValue([mockAccount]);
			mockMsalClient.acquireTokenSilent.mockResolvedValue(mockAuthResult);

			const result = await authManager.authenticate();

			expect(mockMsalClient.acquireTokenSilent).toHaveBeenCalledWith({
				scopes: ['https://graph.microsoft.com/Tasks.ReadWrite'],
				account: mockAccount
			});
			expect(result).toBe(mockAuthResult);
			expect(mockLogger.info).toHaveBeenCalledWith('Silent authentication successful');
		});

		it('should fall back to device code flow when silent auth fails', async () => {
			const mockAccount = { homeAccountId: 'test-account' };
			const mockAuthResult = {
				accessToken: 'test-token',
				expiresOn: new Date()
			};

			mockMsalClient.getAllAccounts.mockResolvedValue([mockAccount]);
			mockMsalClient.acquireTokenSilent.mockRejectedValue(new Error('Silent auth failed'));
			mockMsalClient.acquireTokenByDeviceCode.mockResolvedValue(mockAuthResult);

			const result = await authManager.authenticate();

			expect(mockMsalClient.acquireTokenByDeviceCode).toHaveBeenCalled();
			expect(result).toBe(mockAuthResult);
			expect(mockLogger.debug).toHaveBeenCalledWith('Silent authentication failed, proceeding with device code flow');
		});

		it('should use device code flow when no accounts exist', async () => {
			const mockAuthResult = {
				accessToken: 'test-token',
				expiresOn: new Date()
			};

			mockMsalClient.getAllAccounts.mockResolvedValue([]);
			mockMsalClient.acquireTokenByDeviceCode.mockResolvedValue(mockAuthResult);

			const result = await authManager.authenticate();

			expect(mockMsalClient.acquireTokenByDeviceCode).toHaveBeenCalled();
			expect(result).toBe(mockAuthResult);
		});

		it('should call device code callback when provided', async () => {
			const mockAuthResult = {
				accessToken: 'test-token',
				expiresOn: new Date()
			};
			const mockCallback = jest.fn();

			mockMsalClient.getAllAccounts.mockResolvedValue([]);
			mockMsalClient.acquireTokenByDeviceCode.mockImplementation((request) => {
				// Simulate device code callback
				request.deviceCodeCallback({
					userCode: 'ABC123',
					verificationUri: 'https://microsoft.com/devicelogin'
				});
				return Promise.resolve(mockAuthResult);
			});

			const result = await authManager.authenticate(mockCallback);

			expect(mockCallback).toHaveBeenCalledWith('ABC123', 'https://microsoft.com/devicelogin');
			expect(result).toBe(mockAuthResult);
		});

		it('should handle authentication errors', async () => {
			mockMsalClient.getAllAccounts.mockResolvedValue([]);
			mockMsalClient.acquireTokenByDeviceCode.mockRejectedValue(new Error('Auth error'));
			mockErrorHandler.handleApiError.mockReturnValue('Handled auth error');

			await expect(authManager.authenticate()).rejects.toThrow(
				'Authentication failed: Handled auth error'
			);
		});

		it('should handle null authentication result', async () => {
			mockMsalClient.getAllAccounts.mockResolvedValue([]);
			mockMsalClient.acquireTokenByDeviceCode.mockResolvedValue(null);
			mockErrorHandler.handleApiError.mockReturnValue('Authentication result is null');

			await expect(authManager.authenticate()).rejects.toThrow(
				'Authentication failed: Authentication result is null'
			);
		});

		it('should throw error when MSAL client not initialized', async () => {
			const uninitializedManager = new MSALAuthenticationManager(mockLogger, mockErrorHandler);

			await expect(uninitializedManager.authenticate()).rejects.toThrow(
				'MSAL client not initialized'
			);
		});
	});

	describe('getAccessToken', () => {
		beforeEach(async () => {
			await authManager.initialize('test-client-id');
		});

		it('should get access token silently', async () => {
			const mockAccount = { homeAccountId: 'test-account' };
			const mockTokenResult = {
				accessToken: 'test-token'
			};

			mockMsalClient.getAllAccounts.mockResolvedValue([mockAccount]);
			mockMsalClient.acquireTokenSilent.mockResolvedValue(mockTokenResult);

			const token = await authManager.getAccessToken();

			expect(token).toBe('test-token');
			expect(mockMsalClient.acquireTokenSilent).toHaveBeenCalledWith({
				scopes: ['https://graph.microsoft.com/Tasks.ReadWrite'],
				account: mockAccount
			});
		});

		it('should throw error when no accounts found', async () => {
			mockMsalClient.getAllAccounts.mockResolvedValue([]);

			await expect(authManager.getAccessToken()).rejects.toThrow(
				'Token expired. Re-authentication required.'
			);
		});

		it('should handle token refresh failure', async () => {
			const mockAccount = { homeAccountId: 'test-account' };

			mockMsalClient.getAllAccounts.mockResolvedValue([mockAccount]);
			mockMsalClient.acquireTokenSilent.mockRejectedValue(new Error('Token expired'));

			await expect(authManager.getAccessToken()).rejects.toThrow(
				'Token expired. Re-authentication required.'
			);

			expect(mockLogger.debug).toHaveBeenCalledWith('Token refresh failed, re-authentication required');
		});

		it('should throw error when MSAL client not initialized', async () => {
			const uninitializedManager = new MSALAuthenticationManager(mockLogger, mockErrorHandler);

			await expect(uninitializedManager.getAccessToken()).rejects.toThrow(
				'MSAL client not initialized'
			);
		});
	});

	describe('logout', () => {
		beforeEach(async () => {
			await authManager.initialize('test-client-id');
		});

		it('should logout successfully', async () => {
			mockMsalClient.getAllAccounts.mockResolvedValue([]);

			await authManager.logout();

			expect(mockLogger.info).toHaveBeenCalledWith('Logout successful');
		});

		it('should handle logout errors', async () => {
			mockMsalClient.getAllAccounts.mockRejectedValue(new Error('Logout error'));

			await authManager.logout();

			expect(mockErrorHandler.logError).toHaveBeenCalledWith(
				'Logout failed',
				'Auth',
				expect.any(Error)
			);
		});

		it('should handle logout when MSAL client not initialized', async () => {
			const uninitializedManager = new MSALAuthenticationManager(mockLogger, mockErrorHandler);

			await expect(uninitializedManager.logout()).resolves.not.toThrow();
		});
	});

	describe('isAuthenticated', () => {
		beforeEach(async () => {
			await authManager.initialize('test-client-id');
		});

		it('should return true when accounts exist', async () => {
			mockMsalClient.getAllAccounts.mockResolvedValue([{ homeAccountId: 'test' }]);

			const result = await authManager.isAuthenticated();

			expect(result).toBe(true);
		});

		it('should return false when no accounts exist', async () => {
			mockMsalClient.getAllAccounts.mockResolvedValue([]);

			const result = await authManager.isAuthenticated();

			expect(result).toBe(false);
		});

		it('should return false when check fails', async () => {
			mockMsalClient.getAllAccounts.mockRejectedValue(new Error('Check failed'));

			const result = await authManager.isAuthenticated();

			expect(result).toBe(false);
			expect(mockLogger.debug).toHaveBeenCalledWith('Authentication check failed');
		});

		it('should return false when MSAL client not initialized', async () => {
			const uninitializedManager = new MSALAuthenticationManager(mockLogger, mockErrorHandler);

			const result = await uninitializedManager.isAuthenticated();

			expect(result).toBe(false);
		});
	});
});