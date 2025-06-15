import { TodoApiClient } from '../../src/api/todo-api-client';
import { Logger } from '../../src/utils/logger';
import { ErrorHandler } from '../../src/utils/error-handler';

jest.mock('isomorphic-fetch');

// Mock Microsoft Graph Client
const mockApiRequest = {
	get: jest.fn(),
	post: jest.fn(),
	patch: jest.fn(),
	delete: jest.fn(),
	select: jest.fn().mockReturnThis()
};

const mockGraphClient = {
	api: jest.fn().mockReturnValue(mockApiRequest)
};

jest.mock('@microsoft/microsoft-graph-client', () => ({
	Client: {
		init: jest.fn().mockImplementation(() => mockGraphClient)
	}
}));

describe('TodoApiClient', () => {
	let apiClient: TodoApiClient;
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

		apiClient = new TodoApiClient(mockLogger, mockErrorHandler);
		
		// Reset mocks
		jest.clearAllMocks();
		mockGraphClient.api.mockReturnValue(mockApiRequest);
		mockApiRequest.select.mockReturnValue(mockApiRequest);
	});

	describe('initialize', () => {
		it('should initialize Graph client with access token', () => {
			apiClient.initialize('test-access-token');

			expect(mockLogger.info).toHaveBeenCalledWith('Graph client initialized');
		});

		it('should handle auth provider callback', async () => {
			let authProvider: any;
			
			const { Client } = require('@microsoft/microsoft-graph-client');
			Client.init.mockImplementation((config: any) => {
				authProvider = config.authProvider;
				return mockGraphClient;
			});

			apiClient.initialize('test-access-token');

			// Test auth provider callback
			const mockDone = jest.fn();
			await authProvider(mockDone);

			expect(mockDone).toHaveBeenCalledWith(null, 'Bearer test-access-token');
		});

		it('should handle auth provider errors', async () => {
			let authProvider: any;
			
			const { Client } = require('@microsoft/microsoft-graph-client');
			Client.init.mockImplementation((config: any) => {
				authProvider = config.authProvider;
				return mockGraphClient;
			});

			// Mock an error in the auth provider
			Client.init.mockImplementation((config: any) => {
				authProvider = (done: any) => {
					throw new Error('Auth error');
				};
				return mockGraphClient;
			});

			apiClient.initialize('test-access-token');
		});
	});

	describe('getOrCreateTaskList', () => {
		beforeEach(() => {
			apiClient.initialize('test-token');
		});

		it('should return existing task list', async () => {
			const mockLists = {
				value: [
					{ id: 'list-1', displayName: 'Other List' },
					{ id: 'list-2', displayName: 'Obsidian Tasks' }
				]
			};

			mockApiRequest.get.mockResolvedValue(mockLists);

			const listId = await apiClient.getOrCreateTaskList('Obsidian Tasks');

			expect(listId).toBe('list-2');
			expect(mockGraphClient.api).toHaveBeenCalledWith('/me/todo/lists');
			expect(mockLogger.info).toHaveBeenCalledWith('Using task list: Obsidian Tasks (ID: list-2)');
		});

		it('should create new task list when not found', async () => {
			const mockLists = {
				value: [
					{ id: 'list-1', displayName: 'Other List' }
				]
			};
			const mockNewList = {
				id: 'new-list-id',
				displayName: 'Obsidian Tasks'
			};

			mockApiRequest.get.mockResolvedValue(mockLists);
			mockApiRequest.post.mockResolvedValue(mockNewList);

			const listId = await apiClient.getOrCreateTaskList('Obsidian Tasks');

			expect(listId).toBe('new-list-id');
			expect(mockApiRequest.post).toHaveBeenCalledWith({
				displayName: 'Obsidian Tasks'
			});
			expect(mockLogger.info).toHaveBeenCalledWith('Creating new task list: Obsidian Tasks');
		});

		it('should use default list name', async () => {
			const mockLists = {
				value: [
					{ id: 'list-1', displayName: 'Obsidian Tasks' }
				]
			};

			mockApiRequest.get.mockResolvedValue(mockLists);

			const listId = await apiClient.getOrCreateTaskList();

			expect(listId).toBe('list-1');
		});

		it('should handle API errors', async () => {
			mockApiRequest.get.mockRejectedValue(new Error('API Error'));
			mockErrorHandler.handleApiError.mockReturnValue('Handled API Error');

			await expect(apiClient.getOrCreateTaskList()).rejects.toThrow(
				'Failed to get/create task list: Handled API Error'
			);
		});

		it('should throw error when Graph client not initialized', async () => {
			const uninitializedClient = new TodoApiClient(mockLogger, mockErrorHandler);

			await expect(uninitializedClient.getOrCreateTaskList()).rejects.toThrow(
				'Graph client not initialized'
			);
		});
	});

	describe('getTasks', () => {
		beforeEach(async () => {
			apiClient.initialize('test-token');
			// Set up list ID
			const mockLists = { value: [{ id: 'test-list-id', displayName: 'Test List' }] };
			mockApiRequest.get.mockResolvedValue(mockLists);
			await apiClient.getOrCreateTaskList();
			jest.clearAllMocks();
			mockGraphClient.api.mockReturnValue(mockApiRequest);
			mockApiRequest.select.mockReturnValue(mockApiRequest);
		});

		it('should get tasks successfully', async () => {
			const mockTasks = {
				value: [
					{
						id: 'task-1',
						title: 'Test Task 1',
						body: { content: 'Task body' },
						status: 'notStarted',
						createdDateTime: '2023-01-01T00:00:00Z'
					},
					{
						id: 'task-2',
						title: 'Test Task 2',
						body: 'Simple body',
						status: 'completed',
						completedDateTime: { dateTime: '2023-01-02T00:00:00Z' }
					}
				]
			};

			mockApiRequest.get.mockResolvedValue(mockTasks);

			const tasks = await apiClient.getTasks();

			expect(tasks).toHaveLength(2);
			expect(tasks[0]).toEqual({
				id: 'task-1',
				title: 'Test Task 1',
				body: 'Task body',
				status: 'notStarted',
				createdDateTime: '2023-01-01T00:00:00Z',
				startDateTime: undefined,
				dueDateTime: undefined,
				completedDateTime: undefined
			});
			expect(mockApiRequest.select).toHaveBeenCalledWith(
				'id,title,body,startDateTime,dueDateTime,status,createdDateTime,completedDateTime'
			);
			expect(mockLogger.debug).toHaveBeenCalledWith('Retrieved 2 tasks from Microsoft Todo');
		});

		it('should handle API errors', async () => {
			mockApiRequest.get.mockRejectedValue(new Error('API Error'));
			mockErrorHandler.handleApiError.mockReturnValue('Handled API Error');

			await expect(apiClient.getTasks()).rejects.toThrow(
				'Failed to get tasks: Handled API Error'
			);
		});
	});

	describe('createTask', () => {
		beforeEach(async () => {
			apiClient.initialize('test-token');
			const mockLists = { value: [{ id: 'test-list-id', displayName: 'Test List' }] };
			mockApiRequest.get.mockResolvedValue(mockLists);
			await apiClient.getOrCreateTaskList();
			jest.clearAllMocks();
			mockGraphClient.api.mockReturnValue(mockApiRequest);
		});

		it('should create task successfully', async () => {
			const mockCreatedTask = {
				id: 'new-task-id',
				title: 'New Task',
				status: 'notStarted',
				createdDateTime: '2023-01-01T00:00:00Z'
			};

			mockApiRequest.post.mockResolvedValue(mockCreatedTask);

			const task = await apiClient.createTask('New Task');

			expect(mockApiRequest.post).toHaveBeenCalledWith({
				title: 'New Task',
				status: 'notStarted'
			});
			expect(task.title).toBe('New Task');
			expect(mockLogger.info).toHaveBeenCalledWith('Created task: New Task');
		});

		it('should create task with start date', async () => {
			const mockCreatedTask = {
				id: 'new-task-id',
				title: 'New Task',
				status: 'notStarted'
			};

			mockApiRequest.post.mockResolvedValue(mockCreatedTask);

			await apiClient.createTask('New Task', '2023-01-01');

			expect(mockApiRequest.post).toHaveBeenCalledWith({
				title: 'New Task',
				status: 'notStarted',
				startDateTime: {
					dateTime: '2023-01-01T09:00:00.000Z',
					timeZone: 'UTC'
				}
			});
		});

		it('should validate task title', async () => {
			await expect(apiClient.createTask('')).rejects.toThrow(
				'Task title cannot be empty'
			);

			await expect(apiClient.createTask('   ')).rejects.toThrow(
				'Task title cannot be empty'
			);
		});

		it('should handle API errors', async () => {
			mockApiRequest.post.mockRejectedValue(new Error('API Error'));
			mockErrorHandler.handleApiError.mockReturnValue('Handled API Error');

			await expect(apiClient.createTask('Test Task')).rejects.toThrow(
				'Failed to create task: Handled API Error'
			);
		});
	});

	describe('completeTask', () => {
		beforeEach(async () => {
			apiClient.initialize('test-token');
			const mockLists = { value: [{ id: 'test-list-id', displayName: 'Test List' }] };
			mockApiRequest.get.mockResolvedValue(mockLists);
			await apiClient.getOrCreateTaskList();
			jest.clearAllMocks();
			mockGraphClient.api.mockReturnValue(mockApiRequest);
		});

		it('should complete task successfully', async () => {
			mockApiRequest.patch.mockResolvedValue({});

			await apiClient.completeTask('task-id');

			expect(mockApiRequest.patch).toHaveBeenCalledWith({
				status: 'completed'
			});
			expect(mockLogger.info).toHaveBeenCalledWith('Completed task: task-id');
		});

		it('should validate task ID', async () => {
			await expect(apiClient.completeTask('')).rejects.toThrow(
				'Task ID cannot be empty'
			);
		});

		it('should handle task not found', async () => {
			const notFoundError = {
				response: { status: 404 }
			};
			mockApiRequest.patch.mockRejectedValue(notFoundError);

			await expect(apiClient.completeTask('invalid-id')).rejects.toThrow(
				'Task not found: invalid-id'
			);
		});

		it('should handle other API errors', async () => {
			mockApiRequest.patch.mockRejectedValue(new Error('API Error'));
			mockErrorHandler.handleApiError.mockReturnValue('Handled API Error');

			await expect(apiClient.completeTask('task-id')).rejects.toThrow(
				'Failed to complete task: Handled API Error'
			);
		});
	});

	describe('deleteTask', () => {
		beforeEach(async () => {
			apiClient.initialize('test-token');
			const mockLists = { value: [{ id: 'test-list-id', displayName: 'Test List' }] };
			mockApiRequest.get.mockResolvedValue(mockLists);
			await apiClient.getOrCreateTaskList();
			jest.clearAllMocks();
			mockGraphClient.api.mockReturnValue(mockApiRequest);
		});

		it('should delete task successfully', async () => {
			mockApiRequest.delete.mockResolvedValue({});

			await apiClient.deleteTask('task-id');

			expect(mockApiRequest.delete).toHaveBeenCalled();
			expect(mockLogger.info).toHaveBeenCalledWith('Deleted task: task-id');
		});

		it('should validate task ID', async () => {
			await expect(apiClient.deleteTask('')).rejects.toThrow(
				'Task ID cannot be empty'
			);
		});

		it('should handle task not found', async () => {
			const notFoundError = {
				response: { status: 404 }
			};
			mockApiRequest.delete.mockRejectedValue(notFoundError);

			await expect(apiClient.deleteTask('invalid-id')).rejects.toThrow(
				'Task not found: invalid-id'
			);
		});
	});

	describe('getUserInfo', () => {
		beforeEach(() => {
			apiClient.initialize('test-token');
		});

		it('should get user info successfully', async () => {
			const mockUser = {
				mail: 'user@example.com',
				displayName: 'Test User'
			};

			mockApiRequest.get.mockResolvedValue(mockUser);

			const userInfo = await apiClient.getUserInfo();

			expect(userInfo).toEqual({
				email: 'user@example.com',
				displayName: 'Test User'
			});
			expect(mockApiRequest.select).toHaveBeenCalledWith('mail,userPrincipalName,displayName');
			expect(mockLogger.info).toHaveBeenCalledWith('Retrieved user info: Test User (user@example.com)');
		});

		it('should fallback to userPrincipalName when mail is not available', async () => {
			const mockUser = {
				userPrincipalName: 'user@company.onmicrosoft.com',
				displayName: 'Test User'
			};

			mockApiRequest.get.mockResolvedValue(mockUser);

			const userInfo = await apiClient.getUserInfo();

			expect(userInfo.email).toBe('user@company.onmicrosoft.com');
		});

		it('should use default displayName when not available', async () => {
			const mockUser = {
				mail: 'user@example.com'
			};

			mockApiRequest.get.mockResolvedValue(mockUser);

			const userInfo = await apiClient.getUserInfo();

			expect(userInfo.displayName).toBe('Microsoft User');
		});

		it('should handle API errors', async () => {
			mockApiRequest.get.mockRejectedValue(new Error('API Error'));
			mockErrorHandler.handleApiError.mockReturnValue('Handled API Error');

			await expect(apiClient.getUserInfo()).rejects.toThrow(
				'Failed to get user info: Handled API Error'
			);
		});
	});

	describe('utility methods', () => {
		it('should return list ID', async () => {
			apiClient.initialize('test-token');
			const mockLists = { value: [{ id: 'test-list-id', displayName: 'Test List' }] };
			mockApiRequest.get.mockResolvedValue(mockLists);
			
			await apiClient.getOrCreateTaskList();

			expect(apiClient.getListId()).toBe('test-list-id');
		});

		it('should check if initialized', () => {
			expect(apiClient.isInitialized()).toBe(false);

			apiClient.initialize('test-token');
			expect(apiClient.isInitialized()).toBe(false); // Still false without list ID

			// Would be true after getOrCreateTaskList is called
		});
	});
});