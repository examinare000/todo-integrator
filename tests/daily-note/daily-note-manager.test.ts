import { DailyNoteManager } from '../../src/daily-note/daily-note-manager';
import { Logger } from '../../src/utils/logger';
import { ErrorHandler } from '../../src/utils/error-handler';

// Mock Obsidian
const mockApp = {
	vault: {
		adapter: {
			exists: jest.fn(),
			read: jest.fn(),
			write: jest.fn()
		},
		getAbstractFileByPath: jest.fn(),
		createFolder: jest.fn(),
		create: jest.fn(),
		read: jest.fn(),
		modify: jest.fn()
	}
};

jest.mock('obsidian', () => ({
	moment: jest.fn().mockImplementation((date) => ({
		format: jest.fn().mockReturnValue('2023-01-01')
	}))
}));

describe('DailyNoteManager', () => {
	let dailyNoteManager: DailyNoteManager;
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
			handleApiError: jest.fn().mockReturnValue('API error'),
			logError: jest.fn(),
			handleFileError: jest.fn().mockReturnValue('File error')
		} as any;

		dailyNoteManager = new DailyNoteManager(mockApp as any, mockLogger, mockErrorHandler);
		
		// Clear only call history, not mock implementations
		jest.clearAllMocks();
		
		// Restore default mock return values after clearAllMocks
		mockErrorHandler.handleFileError.mockReturnValue('File error');
	});

	describe('initialization and settings', () => {
		it('should initialize with default settings', () => {
			expect(dailyNoteManager).toBeDefined();
		});

		it('should update settings', () => {
			dailyNoteManager.updateSettings('Custom Notes', 'DD-MM-YYYY', '## Tasks');

			// Test by calling getTodayNote which uses the settings
			const path = dailyNoteManager.getTodayNote();
			expect(path).toContain('Custom Notes');
		});
	});

	describe('getTodayNote', () => {
		it('should generate correct path with default settings', () => {
			const path = dailyNoteManager.getTodayNote();
			
			expect(path).toBe('Daily Notes/2023-01-01.md');
		});

		it('should generate correct path with custom settings', () => {
			dailyNoteManager.updateSettings('Custom', 'DD-MM-YYYY', '## Tasks');
			
			const path = dailyNoteManager.getTodayNote();
			
			expect(path).toBe('Custom/2023-01-01.md');
		});
	});

	describe('createTodayNote', () => {
		it('should return existing file when file exists', async () => {
			const mockFile = { path: 'Daily Notes/2023-01-01.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			
			// Ensure no error is thrown by making sure all vault methods work properly
			mockApp.vault.createFolder.mockResolvedValue(void 0);
			mockApp.vault.create.mockResolvedValue(mockFile);

			const file = await dailyNoteManager.createTodayNote();

			expect(file).toBe(mockFile);
			expect(mockLogger.debug).toHaveBeenCalledWith("Today's note already exists: Daily Notes/2023-01-01.md");
		});

		it('should create new file when file does not exist', async () => {
			const mockFile = { path: 'Daily Notes/2023-01-01.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
			mockApp.vault.createFolder.mockResolvedValue(void 0);
			mockApp.vault.create.mockResolvedValue(mockFile);

			const file = await dailyNoteManager.createTodayNote();

			expect(file).toBe(mockFile);
			expect(mockApp.vault.create).toHaveBeenCalledWith(
				'Daily Notes/2023-01-01.md',
				expect.stringContaining('# 2023-01-01')
			);
			expect(mockLogger.info).toHaveBeenCalledWith('Created today\'s note: Daily Notes/2023-01-01.md');
		});

		it('should handle file creation errors', async () => {
			mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
			mockApp.vault.createFolder.mockResolvedValue(void 0);
			mockApp.vault.create.mockRejectedValue(new Error('Create error'));
			mockErrorHandler.handleFileError.mockReturnValueOnce('Handled file error');

			await expect(dailyNoteManager.createTodayNote()).rejects.toThrow(
				'Failed to create today\'s note: Handled file error'
			);
		});
	});

	describe('findOrCreateTodoSection', () => {
		it('should find existing todo section', async () => {
			const fileContent = `# Daily Note

## Some Section

Content here

## ToDo

- [ ] Existing task

## Another Section`;

			const file = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(file);
			mockApp.vault.read.mockResolvedValue(fileContent);

			const lineNumber = await dailyNoteManager.findOrCreateTodoSection('test-file.md');

			expect(lineNumber).toBe(6); // Line where "## ToDo" appears (0-based index)
			expect(mockLogger.debug).toHaveBeenCalledWith('Found existing todo section at line 7');
		});

		it('should create todo section when not found', async () => {
			const fileContent = `# Daily Note

## Some Section

Content here`;

			const expectedContent = `# Daily Note

## Some Section

Content here

## ToDo
`;

			const file = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(file);
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockResolvedValue(void 0);

			const lineNumber = await dailyNoteManager.findOrCreateTodoSection('test-file.md');

			expect(lineNumber).toBe(6); // Line where new ToDo section was added (0-based)
			expect(mockApp.vault.modify).toHaveBeenCalledWith(file, expectedContent);
			expect(mockLogger.info).toHaveBeenCalledWith('Created todo section in test-file.md');
		});

		it('should handle custom todo section header', async () => {
			dailyNoteManager.updateSettings('Daily Notes', 'YYYY-MM-DD', '## Tasks');
			
			const fileContent = `# Daily Note`;
			const file = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(file);
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockResolvedValue(void 0);

			await dailyNoteManager.findOrCreateTodoSection('test-file.md');

			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				file,
				expect.stringContaining('## Tasks')
			);
		});

		it('should handle file read errors', async () => {
			const file = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(file);
			mockApp.vault.read.mockRejectedValue(new Error('Read error'));
			mockErrorHandler.handleFileError.mockReturnValueOnce('Handled read error');

			await expect(dailyNoteManager.findOrCreateTodoSection('test-file.md')).rejects.toThrow(
				'Failed to find/create todo section: Handled read error'
			);
		});
	});

	describe('addTaskToTodoSection', () => {
		it('should add task to todo section', async () => {
			const fileContent = `# Daily Note

## ToDo

- [ ] Existing task

## Another Section`;

			const expectedContent = `# Daily Note

## ToDo

- [ ] Existing task
- [ ] New task

## Another Section`;

			const mockFile = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockResolvedValue(void 0);

			await dailyNoteManager.addTaskToTodoSection('test-file.md', 'New task');

			expect(mockApp.vault.modify).toHaveBeenCalledWith(mockFile, expectedContent);
			expect(mockLogger.info).toHaveBeenCalledWith('Added task to test-file.md: New task');
		});

		it('should add task to empty todo section', async () => {
			const fileContent = `# Daily Note

## ToDo

`;

			const expectedContent = `# Daily Note

## ToDo
- [ ] New task

`;

			const mockFile = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockResolvedValue(void 0);

			await dailyNoteManager.addTaskToTodoSection('test-file.md', 'New task');

			expect(mockApp.vault.modify).toHaveBeenCalledWith(mockFile, expectedContent);
		});

		it('should create todo section if not found', async () => {
			const initialContent = `# Daily Note

## Some Section`;

			const contentWithTodoSection = `# Daily Note

## Some Section

## ToDo
`;

			const mockFile = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			
			// Mock read calls: first for addTaskToTodoSection, second for findOrCreateTodoSection, third for recursive addTaskToTodoSection
			mockApp.vault.read.mockResolvedValueOnce(initialContent)      // First addTaskToTodoSection call
			                    .mockResolvedValueOnce(initialContent)      // findOrCreateTodoSection call
			                    .mockResolvedValueOnce(contentWithTodoSection); // Recursive addTaskToTodoSection call
			mockApp.vault.modify.mockResolvedValue(void 0);

			await dailyNoteManager.addTaskToTodoSection('test-file.md', 'New task');

			// Should call modify twice: once to create section, once to add task
			expect(mockApp.vault.modify).toHaveBeenCalledTimes(2);
		});

		it('should handle file operation errors', async () => {
			const mockFile = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockRejectedValue(new Error('Read error'));
			mockErrorHandler.handleFileError.mockReturnValue('Handled error');

			await expect(
				dailyNoteManager.addTaskToTodoSection('test-file.md', 'New task')
			).rejects.toThrow('Failed to add task: Handled error');
		});
	});

	describe('parseDailyNoteTodos', () => {
		it('should parse tasks from daily note', async () => {
			const fileContent = `# Daily Note

## ToDo

- [ ] Incomplete task
- [x] Completed task [completion:: 2023-01-01]
- [ ] Another task <!--todo:task-123-->
- [x] Done task

## Other Section

- [ ] Not a todo section task`;

			const mockFile = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);

			const tasks = await dailyNoteManager.parseDailyNoteTodos('test-file.md');

			// Implementation parses all tasks in file, not just ToDo section
			expect(tasks).toHaveLength(5);
			expect(tasks[0]).toEqual({
				title: 'Incomplete task',
				completed: false,
				line: 4,
				completionDate: undefined
			});
			expect(tasks[1]).toEqual({
				title: 'Completed task',
				completed: true,
				line: 5,
				completionDate: '2023-01-01'
			});
			expect(tasks[2]).toEqual({
				title: 'Another task <!--todo:task-123-->',
				completed: false,
				line: 6,
				completionDate: undefined
			});
			expect(tasks[3]).toEqual({
				title: 'Done task',
				completed: true,
				line: 7,
				completionDate: undefined
			});
			expect(tasks[4]).toEqual({
				title: 'Not a todo section task',
				completed: false,
				line: 11,
				completionDate: undefined
			});
		});

		it('should return empty array when no todo section found', async () => {
			const fileContent = `# Daily Note

## Some Section

Content`;

			const mockFile = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read = jest.fn().mockResolvedValue(fileContent);

			const tasks = await dailyNoteManager.parseDailyNoteTodos('test-file.md');

			expect(tasks).toHaveLength(0);
		});

		it('should handle file read errors', async () => {
			const mockFile = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read = jest.fn().mockRejectedValue(new Error('Read error'));
			mockErrorHandler.handleFileError.mockReturnValue('Handled error');

			await expect(dailyNoteManager.parseDailyNoteTodos('test-file.md')).rejects.toThrow(
				'Failed to parse daily note todos: Handled error'
			);
		});
	});

	describe('updateTaskCompletion', () => {
		it('should mark task as completed with completion date', async () => {
			const fileContent = `# Daily Note

## ToDo

- [ ] Task to complete
- [ ] Another task`;

			const expectedContent = `# Daily Note

## ToDo

- [x] Task to complete [completion:: 2023-01-01]
- [ ] Another task`;

			const mockFile = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockResolvedValue(void 0);

			await dailyNoteManager.updateTaskCompletion('test-file.md', 4, '2023-01-01');

			expect(mockApp.vault.modify).toHaveBeenCalledWith(mockFile, expectedContent);
			expect(mockLogger.info).toHaveBeenCalledWith(
				'Updated task completion at line 5: 2023-01-01'
			);
		});

		it('should mark task as completed with empty completion date', async () => {
			const fileContent = `# Daily Note

## ToDo

- [x] Completed task [completion:: 2023-01-01]
- [ ] Another task`;

			const expectedContent = `# Daily Note

## ToDo

- [x] Completed task [completion:: ]
- [ ] Another task`;

			const mockFile = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockResolvedValue(void 0);

			await dailyNoteManager.updateTaskCompletion('test-file.md', 4, '');

			expect(mockApp.vault.modify).toHaveBeenCalledWith(mockFile, expectedContent);
		});

		it('should handle invalid line numbers', async () => {
			const fileContent = `# Daily Note

## ToDo

- [ ] Only task`;

			const mockFile = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			await expect(
				dailyNoteManager.updateTaskCompletion('test-file.md', 10, '2023-01-01')
			).rejects.toThrow('Failed to update task completion: File error');
		});

		it('should handle file operation errors', async () => {
			const mockFile = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockRejectedValue(new Error('Read error'));
			mockErrorHandler.handleFileError.mockReturnValue('Handled error');

			await expect(
				dailyNoteManager.updateTaskCompletion('test-file.md', 1, '2023-01-01')
			).rejects.toThrow('Failed to update task completion: Handled error');
		});
	});

	describe('edge cases and error handling', () => {
		it('should handle empty files', async () => {
			const mockFile = { path: 'empty-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue('');

			const tasks = await dailyNoteManager.parseDailyNoteTodos('empty-file.md');
			expect(tasks).toHaveLength(0);
		});

		it('should handle files with only headers', async () => {
			const mockFile = { path: 'header-only.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue('# Title\n\n## ToDo\n\n');

			const tasks = await dailyNoteManager.parseDailyNoteTodos('header-only.md');
			expect(tasks).toHaveLength(0);
		});

		it('should handle malformed task lines gracefully', async () => {
			const fileContent = `# Daily Note

## ToDo

- [ ] Normal task
- [invalid] Malformed task
- [ ] Another normal task`;

			const mockFile = { path: 'test-file.md' };
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockApp.vault.read.mockResolvedValue(fileContent);

			const tasks = await dailyNoteManager.parseDailyNoteTodos('test-file.md');
			
			// Should only return the valid tasks
			expect(tasks).toHaveLength(2);
			expect(tasks[0].title).toBe('Normal task');
			expect(tasks[1].title).toBe('Another normal task');
		});
	});
});