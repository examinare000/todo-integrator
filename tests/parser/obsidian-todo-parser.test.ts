import { ObsidianTodoParser } from '../../src/parser/obsidian-todo-parser';
import { Logger } from '../../src/utils/logger';
import { ErrorHandler } from '../../src/utils/error-handler';

// Mock Obsidian TFile
jest.mock('obsidian', () => ({
	TFile: class MockTFile {
		stat = { mtime: Date.now() };
	}
}));

// Mock Obsidian App
const mockApp = {
	vault: {
		getAbstractFileByPath: jest.fn(),
		read: jest.fn(),
		modify: jest.fn()
	}
} as any;

const { TFile } = require('obsidian');

describe('ObsidianTodoParser', () => {
	let parser: ObsidianTodoParser;
	let logger: Logger;
	let errorHandler: ErrorHandler;

	beforeEach(() => {
		logger = new Logger('error');
		errorHandler = new ErrorHandler(logger);
		parser = new ObsidianTodoParser(mockApp, logger, errorHandler);
		
		// Reset mocks
		jest.clearAllMocks();
		jest.spyOn(console, 'error').mockImplementation();
	});

	describe('parseFileTodos', () => {
		it('should parse incomplete tasks correctly', async () => {
			const content = `# Test File
- [ ] Task 1
- [ ] Task 2 due: 2024-01-01
- [x] Completed task [completion:: 2024-01-02]`;

			mockApp.vault.getAbstractFileByPath.mockReturnValue(new TFile());
			mockApp.vault.read.mockResolvedValue(content);

			const tasks = await parser.parseFileTodos('test.md');

			expect(tasks).toHaveLength(3);
			expect(tasks[0]).toEqual({
				file: 'test.md',
				line: 1,
				text: 'Task 1',
				completed: false,
				completionDate: undefined,
				dueDate: undefined
			});
			expect(tasks[1]).toEqual({
				file: 'test.md',
				line: 2,
				text: 'Task 2',
				completed: false,
				completionDate: undefined,
				dueDate: '2024-01-01'
			});
			expect(tasks[2]).toEqual({
				file: 'test.md',
				line: 3,
				text: 'Completed task',
				completed: true,
				completionDate: '2024-01-02',
				dueDate: undefined
			});
		});

		it('should throw error when file not found', async () => {
			mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

			await expect(parser.parseFileTodos('nonexistent.md'))
				.rejects.toThrow('Failed to parse file todos');
		});
	});

	describe('updateCheckboxStatus', () => {
		it('should update checkbox to completed with completion date', async () => {
			const content = `- [ ] Task to complete`;
			const lines = content.split('\n');

			mockApp.vault.getAbstractFileByPath.mockReturnValue(new TFile());
			mockApp.vault.read.mockResolvedValue(content);

			await parser.updateCheckboxStatus('test.md', 0, true, '2024-01-01');

			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				expect.any(TFile),
				'- [x] Task to complete [completion:: 2024-01-01]'
			);
		});

		it('should update checkbox to incomplete', async () => {
			const content = `- [x] Completed task [completion:: 2024-01-01]`;

			mockApp.vault.getAbstractFileByPath.mockReturnValue(new TFile());
			mockApp.vault.read.mockResolvedValue(content);

			await parser.updateCheckboxStatus('test.md', 0, false);

			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				expect.any(TFile),
				'- [ ] Completed task'
			);
		});

		it('should throw error when no checkbox found', async () => {
			const content = `Regular text line`;

			mockApp.vault.getAbstractFileByPath.mockReturnValue(new TFile());
			mockApp.vault.read.mockResolvedValue(content);

			await expect(parser.updateCheckboxStatus('test.md', 0, true))
				.rejects.toThrow('Failed to update checkbox status');
		});
	});

	describe('getFileModificationDate', () => {
		it('should return file modification date', async () => {
			const mtime = Date.now();
			const mockFile = new TFile();
			mockFile.stat = { mtime } as any;
			mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);

			const result = await parser.getFileModificationDate('test.md');

			expect(result).toEqual(new Date(mtime));
		});

		it('should throw error when file not found', async () => {
			mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

			await expect(parser.getFileModificationDate('nonexistent.md'))
				.rejects.toThrow('Failed to get file modification date');
		});
	});

	describe('extractTaskTitle', () => {
		it('should extract clean task title', () => {
			const taskLine = 'Buy groceries [completion:: 2024-01-01] due: 2024-01-02 #shopping';
			const result = parser.extractTaskTitle(taskLine);

			expect(result).toBe('Buy groceries');
		});

		it('should handle multiple metadata patterns', () => {
			const taskLine = '**Important** task *with* formatting [completion:: 2024-01-01]';
			const result = parser.extractTaskTitle(taskLine);

			expect(result).toBe('Important task with formatting');
		});

		it('should handle empty or whitespace task', () => {
			const result = parser.extractTaskTitle('   ');
			expect(result).toBe('');
		});
	});
});