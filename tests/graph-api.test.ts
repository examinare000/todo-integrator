// Microsoft Graph APIのテスト
export {};

describe('Microsoft Graph API Integration', () => {
  describe('Task operations', () => {
    test('should create task payload correctly', () => {
      const createTaskPayload = (title: string, content?: string) => {
        return {
          title: title,
          body: {
            content: content || '',
            contentType: 'text'
          },
          importance: 'normal'
        };
      };
      
      const payload = createTaskPayload('Test Task', 'Test content');
      
      expect(payload).toEqual({
        title: 'Test Task',
        body: {
          content: 'Test content',
          contentType: 'text'
        },
        importance: 'normal'
      });
    });

    test('should handle task completion status', () => {
      const createCompletionPayload = (completed: boolean) => {
        return {
          status: completed ? 'completed' : 'notStarted',
          completedDateTime: completed ? new Date().toISOString() : null
        };
      };
      
      const completedPayload = createCompletionPayload(true);
      const notCompletedPayload = createCompletionPayload(false);
      
      expect(completedPayload.status).toBe('completed');
      expect(completedPayload.completedDateTime).toBeTruthy();
      
      expect(notCompletedPayload.status).toBe('notStarted');
      expect(notCompletedPayload.completedDateTime).toBeNull();
    });
  });

  describe('API endpoint validation', () => {
    test('should build correct API endpoints', () => {
      const buildTaskListEndpoint = () => '/me/todo/lists';
      const buildTaskEndpoint = (listId: string) => `/me/todo/lists/${listId}/tasks`;
      const buildSpecificTaskEndpoint = (listId: string, taskId: string) => 
        `/me/todo/lists/${listId}/tasks/${taskId}`;
      
      expect(buildTaskListEndpoint()).toBe('/me/todo/lists');
      expect(buildTaskEndpoint('list123')).toBe('/me/todo/lists/list123/tasks');
      expect(buildSpecificTaskEndpoint('list123', 'task456')).toBe('/me/todo/lists/list123/tasks/task456');
    });
  });

  describe('User info processing', () => {
    test('should extract user information correctly', () => {
      const processUserData = (userData: any) => {
        return {
          email: userData.mail || userData.userPrincipalName || '',
          name: userData.displayName || ''
        };
      };
      
      const userData1 = {
        displayName: 'John Doe',
        mail: 'john@example.com',
        userPrincipalName: 'john@example.com'
      };
      
      const userData2 = {
        displayName: 'Jane Smith',
        userPrincipalName: 'jane@company.onmicrosoft.com'
      };
      
      const result1 = processUserData(userData1);
      const result2 = processUserData(userData2);
      
      expect(result1).toEqual({
        email: 'john@example.com',
        name: 'John Doe'
      });
      
      expect(result2).toEqual({
        email: 'jane@company.onmicrosoft.com',
        name: 'Jane Smith'
      });
    });
  });

  describe('Authorization header', () => {
    test('should format Bearer token correctly', () => {
      const createAuthHeader = (token: string) => {
        return `Bearer ${token}`;
      };
      
      const token = 'abc123token';
      const header = createAuthHeader(token);
      
      expect(header).toBe('Bearer abc123token');
      expect(header.startsWith('Bearer ')).toBe(true);
    });
  });

  describe('Error handling', () => {
    test('should handle Graph API errors', () => {
      const handleGraphError = (error: any) => {
        if (error.code === 'Unauthorized') {
          return 'TOKEN_EXPIRED';
        } else if (error.code === 'Forbidden') {
          return 'INSUFFICIENT_PERMISSIONS';
        } else if (error.code === 'NotFound') {
          return 'RESOURCE_NOT_FOUND';
        } else {
          return 'UNKNOWN_ERROR';
        }
      };
      
      expect(handleGraphError({ code: 'Unauthorized' })).toBe('TOKEN_EXPIRED');
      expect(handleGraphError({ code: 'Forbidden' })).toBe('INSUFFICIENT_PERMISSIONS');
      expect(handleGraphError({ code: 'NotFound' })).toBe('RESOURCE_NOT_FOUND');
      expect(handleGraphError({ code: 'Other' })).toBe('UNKNOWN_ERROR');
    });
  });
});