import { TodoSynchronizer } from '../../src/sync/todo-synchronizer';
import { TodoApiClient } from '../../src/api/todo-api-client';
import { DailyNoteManager } from '../../src/daily-note/daily-note-manager';
import { ObsidianTodoParser } from '../../src/parser/obsidian-todo-parser';
import { Logger } from '../../src/utils/logger';
import { ErrorHandler } from '../../src/utils/error-handler';

// Mock dependencies
jest.mock('../../src/api/todo-api-client');
jest.mock('../../src/daily-note/daily-note-manager');
jest.mock('../../src/parser/obsidian-todo-parser');

describe('TodoSynchronizer', () => {
	let synchronizer: TodoSynchronizer;
	let mockTodoApiClient: jest.Mocked<TodoApiClient>;
	let mockDailyNoteManager: jest.Mocked<DailyNoteManager>;
	let mockObsidianTodoParser: jest.Mocked<ObsidianTodoParser>;
	let logger: Logger;
	let errorHandler: ErrorHandler;

	beforeEach(() => {
		logger = new Logger('error');
		errorHandler = new ErrorHandler(logger);
		
		mockTodoApiClient = new TodoApiClient(logger, errorHandler) as jest.Mocked<TodoApiClient>;
		mockDailyNoteManager = new DailyNoteManager(
			{} as any, logger, errorHandler
		) as jest.Mocked<DailyNoteManager>;
		mockObsidianTodoParser = new ObsidianTodoParser(
			{} as any, logger, errorHandler
		) as jest.Mocked<ObsidianTodoParser>;

		synchronizer = new TodoSynchronizer(
			mockTodoApiClient,
			mockDailyNoteManager,
			mockObsidianTodoParser,
			logger,
			errorHandler
		);

		// Mock console methods
		jest.spyOn(console, 'info').mockImplementation();
		jest.spyOn(console, 'error').mockImplementation();
		jest.spyOn(console, 'debug').mockImplementation();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('syncMsftToObsidian', () => {
		it('should sync new tasks from Microsoft Todo to Daily Note', async () => {
			const msftTasks = [
				{ id: '1', title: 'Task 1', status: 'notStarted' as const },
				{ id: '2', title: 'Task 2', status: 'notStarted' as const }
			];
			const existingTasks = [
				{ title: 'Task 1', completed: false, line: 0 }
			];

			mockTodoApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.createTodayNote.mockResolvedValue({ path: 'today.md' } as any);
			mockDailyNoteManager.parseDailyNoteTodos.mockResolvedValue(existingTasks);
			mockDailyNoteManager.addTaskToTodoSection.mockResolvedValue();

			const result = await synchronizer.syncMsftToObsidian();

			expect(result.newTasks).toBe(1);
			expect(result.errors).toHaveLength(0);
			expect(mockDailyNoteManager.addTaskToTodoSection).toHaveBeenCalledWith('today.md', 'Task 2');
		});

		it('should handle errors when adding tasks', async () => {
			const msftTasks = [
				{ id: '1', title: 'Task 1', status: 'notStarted' as const }
			];

			mockTodoApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.createTodayNote.mockResolvedValue({ path: 'today.md' } as any);
			mockDailyNoteManager.parseDailyNoteTodos.mockResolvedValue([]);
			mockDailyNoteManager.addTaskToTodoSection.mockRejectedValue(new Error('File error'));

			const result = await synchronizer.syncMsftToObsidian();

			expect(result.newTasks).toBe(0);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('Failed to add task "Task 1"');
		});
	});

	describe('syncObsidianToMsft', () => {
		it('should sync new tasks from Obsidian to Microsoft Todo', async () => {
			const dailyNoteTasks = [
				{ title: 'Obsidian Task 1', completed: false, line: 0 },
				{ title: 'Obsidian Task 2', completed: false, line: 1 }
			];
			const msftTasks = [
				{ id: '1', title: 'Obsidian Task 1', status: 'notStarted' as const }
			];

			mockDailyNoteManager.getTodayNote.mockReturnValue('today.md');
			mockDailyNoteManager.parseDailyNoteTodos.mockResolvedValue(dailyNoteTasks);
			mockTodoApiClient.getTasks.mockResolvedValue(msftTasks);
			mockObsidianTodoParser.getFileModificationDate.mockResolvedValue(new Date('2024-01-01'));
			mockTodoApiClient.createTask.mockResolvedValue({
				id: '2', title: 'Obsidian Task 2', status: 'notStarted' as const
			});

			const result = await synchronizer.syncObsidianToMsft();

			expect(result.newTasks).toBe(1);
			expect(result.errors).toHaveLength(0);
			expect(mockTodoApiClient.createTask).toHaveBeenCalledWith('Obsidian Task 2', '2024-01-01');
		});

		it('should skip completed tasks', async () => {
			const dailyNoteTasks = [
				{ title: 'Completed Task', completed: true, line: 0 }
			];

			mockDailyNoteManager.getTodayNote.mockReturnValue('today.md');
			mockDailyNoteManager.parseDailyNoteTodos.mockResolvedValue(dailyNoteTasks);

			const result = await synchronizer.syncObsidianToMsft();

			expect(result.newTasks).toBe(0);
			expect(mockTodoApiClient.getTasks).not.toHaveBeenCalled();
		});
	});

	describe('syncCompletions', () => {
		it('should sync completion from Microsoft Todo to Obsidian', async () => {
			const msftTasks = [
				{ 
					id: '1', 
					title: 'Task 1', 
					status: 'completed' as const,
					completedDateTime: '2024-01-01T10:00:00Z'
				}
			];
			const dailyNoteTasks = [
				{ title: 'Task 1', completed: false, line: 0 }
			];

			mockDailyNoteManager.getTodayNote.mockReturnValue('today.md');
			mockDailyNoteManager.parseDailyNoteTodos.mockResolvedValue(dailyNoteTasks);
			mockTodoApiClient.getTasks.mockResolvedValue(msftTasks);
			mockDailyNoteManager.updateTaskCompletion.mockResolvedValue();

			const result = await synchronizer.syncCompletions();

			expect(result.completedTasks).toBe(1);
			expect(mockDailyNoteManager.updateTaskCompletion).toHaveBeenCalledWith(
				'today.md', 0, '2024-01-01'
			);
		});

		it('should sync completion from Obsidian to Microsoft Todo', async () => {
			const msftTasks = [
				{ id: '1', title: 'Task 1', status: 'notStarted' as const }
			];
			const dailyNoteTasks = [
				{ title: 'Task 1', completed: true, line: 0, completionDate: '2024-01-01' }
			];

			mockDailyNoteManager.getTodayNote.mockReturnValue('today.md');
			mockDailyNoteManager.parseDailyNoteTodos.mockResolvedValue(dailyNoteTasks);
			mockTodoApiClient.getTasks.mockResolvedValue(msftTasks);
			mockTodoApiClient.completeTask.mockResolvedValue();

			const result = await synchronizer.syncCompletions();

			expect(result.completedTasks).toBe(1);
			expect(mockTodoApiClient.completeTask).toHaveBeenCalledWith('1');
		});
	});

	describe('findDuplicateTasks', () => {
		it('should find tasks that do not exist in Microsoft Todo', () => {
			const obsidianTasks = [
				{ title: 'Task 1', completed: false, line: 0 },
				{ title: 'Task 2', completed: false, line: 1 },
				{ title: 'Task 3', completed: false, line: 2 }
			];
			const msftTasks = [
				{ id: '1', title: 'Task 1', status: 'notStarted' as const },
				{ id: '2', title: 'task 2', status: 'notStarted' as const } // case insensitive
			];

			const result = synchronizer.findDuplicateTasks(obsidianTasks, msftTasks);

			expect(result).toHaveLength(1);
			expect(result[0].title).toBe('Task 3');
		});
	});

	describe('filterNewTasks', () => {
		it('should filter out tasks that already exist in Obsidian', () => {
			const msftTasks = [
				{ id: '1', title: 'Task 1', status: 'notStarted' as const },
				{ id: '2', title: 'Task 2', status: 'notStarted' as const },
				{ id: '3', title: 'Task 3', status: 'notStarted' as const }
			];
			const obsidianTasks = [
				{ title: 'Task 1', completed: false, line: 0 },
				{ title: 'TASK 2', completed: false, line: 1 } // case insensitive
			];

			const result = synchronizer.filterNewTasks(msftTasks, obsidianTasks);

			expect(result).toHaveLength(1);
			expect(result[0].title).toBe('Task 3');
		});
	});

	describe('performFullSync', () => {
		it('should perform complete bidirectional sync', async () => {
			// Mock all sync methods
			jest.spyOn(synchronizer, 'syncMsftToObsidian').mockResolvedValue({
				newTasks: 2, errors: []
			});
			jest.spyOn(synchronizer, 'syncObsidianToMsft').mockResolvedValue({
				newTasks: 1, errors: []
			});
			jest.spyOn(synchronizer, 'syncCompletions').mockResolvedValue({
				completedTasks: 3, errors: []
			});

			const result = await synchronizer.performFullSync();

			expect(result.success).toBe(true);
			expect(result.newTasksFromMsft).toBe(2);
			expect(result.newTasksFromObsidian).toBe(1);
			expect(result.completedTasks).toBe(3);
			expect(result.errors).toHaveLength(0);
		});

		it('should report failure when errors occur', async () => {
			jest.spyOn(synchronizer, 'syncMsftToObsidian').mockResolvedValue({
				newTasks: 0, errors: ['Sync error']
			});
			jest.spyOn(synchronizer, 'syncObsidianToMsft').mockResolvedValue({
				newTasks: 0, errors: []
			});
			jest.spyOn(synchronizer, 'syncCompletions').mockResolvedValue({
				completedTasks: 0, errors: []
			});

			const result = await synchronizer.performFullSync();

			expect(result.success).toBe(false);
			expect(result.errors).toHaveLength(1);
		});
	});
});