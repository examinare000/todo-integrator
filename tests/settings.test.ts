import { DEFAULT_SETTINGS } from '../src/types';

describe('Settings Management', () => {
  describe('DEFAULT_SETTINGS', () => {
    test('should have all required properties', () => {
      expect(DEFAULT_SETTINGS).toHaveProperty('clientId');
      expect(DEFAULT_SETTINGS).toHaveProperty('tenantId');
      expect(DEFAULT_SETTINGS).toHaveProperty('dailyNotePath');
      expect(DEFAULT_SETTINGS).toHaveProperty('accessToken');
      expect(DEFAULT_SETTINGS).toHaveProperty('refreshToken');
      expect(DEFAULT_SETTINGS).toHaveProperty('tokenExpiry');
      expect(DEFAULT_SETTINGS).toHaveProperty('userEmail');
      expect(DEFAULT_SETTINGS).toHaveProperty('userName');
      expect(DEFAULT_SETTINGS).toHaveProperty('dateFormat');
      expect(DEFAULT_SETTINGS).toHaveProperty('todoSectionHeader');
      expect(DEFAULT_SETTINGS).toHaveProperty('syncInterval');
      expect(DEFAULT_SETTINGS).toHaveProperty('autoSync');
      expect(DEFAULT_SETTINGS).toHaveProperty('logLevel');
    });

    test('should have correct default values', () => {
      expect(DEFAULT_SETTINGS.clientId).toBe('');
      expect(DEFAULT_SETTINGS.tenantId).toBe('common');
      expect(DEFAULT_SETTINGS.dailyNotePath).toBe('Daily Notes');
      expect(DEFAULT_SETTINGS.accessToken).toBe('');
      expect(DEFAULT_SETTINGS.refreshToken).toBe('');
      expect(DEFAULT_SETTINGS.tokenExpiry).toBe(0);
      expect(DEFAULT_SETTINGS.userEmail).toBe('');
      expect(DEFAULT_SETTINGS.userName).toBe('');
      expect(DEFAULT_SETTINGS.dateFormat).toBe('YYYY-MM-DD');
      expect(DEFAULT_SETTINGS.todoSectionHeader).toBe('## ToDo');
      expect(DEFAULT_SETTINGS.syncInterval).toBe(300000);
      expect(DEFAULT_SETTINGS.autoSync).toBe(true);
      expect(DEFAULT_SETTINGS.logLevel).toBe('info');
    });

    test('should create new object when modified', () => {
      const originalClientId = DEFAULT_SETTINGS.clientId;
      
      // 新しいオブジェクトを作成すべき
      const modifiedSettings = { ...DEFAULT_SETTINGS, clientId: 'modified' };
      expect(modifiedSettings.clientId).toBe('modified');
      expect(DEFAULT_SETTINGS.clientId).toBe(originalClientId);
      
      // 元のオブジェクトは変更されていない
      expect(DEFAULT_SETTINGS.clientId).toBe('');
    });
  });

  describe('Settings validation', () => {
    test('should validate client ID format', () => {
      const validClientId = '12345678-1234-1234-1234-123456789012';
      const invalidClientId = 'invalid-client-id';
      
      // 簡単なUUID形式チェック関数
      const isValidClientId = (clientId: string) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(clientId);
      };
      
      expect(isValidClientId(validClientId)).toBe(true);
      expect(isValidClientId(invalidClientId)).toBe(false);
    });

    test('should validate token expiry', () => {
      const now = Date.now();
      const futureTime = now + (60 * 60 * 1000); // 1時間後
      const pastTime = now - (60 * 60 * 1000); // 1時間前
      
      const isTokenValid = (expiry: number) => {
        return expiry > Date.now();
      };
      
      expect(isTokenValid(futureTime)).toBe(true);
      expect(isTokenValid(pastTime)).toBe(false);
      expect(isTokenValid(0)).toBe(false);
    });
  });
});