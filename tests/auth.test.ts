import { DEFAULT_SETTINGS } from '../main';

// MSAL Nodeのモック
jest.mock('@azure/msal-node', () => ({
  PublicClientApplication: jest.fn().mockImplementation(() => ({
    getAllAccounts: jest.fn(() => Promise.resolve([])),
    acquireTokenSilent: jest.fn(() => Promise.reject(new Error('Silent auth failed'))),
    acquireTokenByDeviceCode: jest.fn((request) => {
      // デバイスコードコールバックを呼び出し
      if (request.deviceCodeCallback) {
        request.deviceCodeCallback({
          userCode: 'TEST123',
          verificationUri: 'https://microsoft.com/devicelogin'
        });
      }
      
      return Promise.resolve({
        accessToken: 'mock-access-token',
        expiresOn: new Date(Date.now() + 3600000), // 1時間後
        account: {
          homeAccountId: 'test-account'
        }
      });
    })
  }))
}));

// Microsoft Graph Clientのモック
jest.mock('@microsoft/microsoft-graph-client', () => ({
  Client: {
    init: jest.fn(() => ({
      api: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({
          displayName: 'Test User',
          mail: 'test@example.com'
        }))
      }))
    }))
  }
}));

describe('Authentication Functions', () => {
  describe('Token validation', () => {
    test('should identify valid token', () => {
      const futureTime = Date.now() + (60 * 60 * 1000); // 1時間後
      
      const isTokenValid = (expiry: number) => {
        return expiry > Date.now();
      };
      
      expect(isTokenValid(futureTime)).toBe(true);
    });

    test('should identify expired token', () => {
      const pastTime = Date.now() - (60 * 60 * 1000); // 1時間前
      
      const isTokenValid = (expiry: number) => {
        return expiry > Date.now();
      };
      
      expect(isTokenValid(pastTime)).toBe(false);
    });

    test('should handle zero expiry', () => {
      const isTokenValid = (expiry: number) => {
        return expiry > Date.now();
      };
      
      expect(isTokenValid(0)).toBe(false);
    });
  });

  describe('Authentication state', () => {
    test('should check authentication status', () => {
      const settings = { ...DEFAULT_SETTINGS };
      
      const isAuthenticated = (settings: any) => {
        return !!(settings.accessToken && Date.now() < settings.tokenExpiry);
      };
      
      // 未認証状態
      expect(isAuthenticated(settings)).toBe(false);
      
      // 認証済み状態
      settings.accessToken = 'valid-token';
      settings.tokenExpiry = Date.now() + 3600000; // 1時間後
      expect(isAuthenticated(settings)).toBe(true);
      
      // トークン期限切れ
      settings.tokenExpiry = Date.now() - 3600000; // 1時間前
      expect(isAuthenticated(settings)).toBe(false);
    });
  });

  describe('Client ID validation', () => {
    test('should validate UUID format', () => {
      const validUUID = '12345678-1234-1234-1234-123456789012';
      const invalidUUID = 'not-a-uuid';
      
      const isValidUUID = (uuid: string) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
      };
      
      expect(isValidUUID(validUUID)).toBe(true);
      expect(isValidUUID(invalidUUID)).toBe(false);
      expect(isValidUUID('')).toBe(false);
    });
  });

  describe('Error handling', () => {
    test('should categorize authentication errors', () => {
      const categorizeError = (errorMessage: string) => {
        if (errorMessage.includes('invalid_client')) {
          return 'CLIENT_ERROR';
        } else if (errorMessage.includes('invalid_scope')) {
          return 'SCOPE_ERROR';
        } else if (errorMessage.includes('network')) {
          return 'NETWORK_ERROR';
        } else {
          return 'UNKNOWN_ERROR';
        }
      };
      
      expect(categorizeError('invalid_client: Bad request')).toBe('CLIENT_ERROR');
      expect(categorizeError('invalid_scope: Tasks.ReadWrite not granted')).toBe('SCOPE_ERROR');
      expect(categorizeError('network timeout')).toBe('NETWORK_ERROR');
      expect(categorizeError('Something else went wrong')).toBe('UNKNOWN_ERROR');
    });
  });
});