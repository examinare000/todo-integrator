import { App, TFile } from 'obsidian';
import { moment } from 'obsidian';
import { DailyNoteTask } from '../types';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';

export class DailyNoteManager {
	private app: App;
	private logger: Logger;
	private errorHandler: ErrorHandler;
	private dailyNotePath: string;
	private dateFormat: string;
	private todoSectionHeader: string;

	constructor(
		app: App, 
		logger: Logger, 
		errorHandler: ErrorHandler,
		dailyNotePath: string = 'Daily Notes',
		dateFormat: string = 'YYYY-MM-DD',
		todoSectionHeader: string = '## ToDo'
	) {
		this.app = app;
		this.logger = logger;
		this.errorHandler = errorHandler;
		this.dailyNotePath = dailyNotePath;
		this.dateFormat = dateFormat;
		this.todoSectionHeader = todoSectionHeader;
	}

	getTodayNote(): string {
		const today = (moment as any)().format(this.dateFormat);
		const dailyNotePath = this.dailyNotePath.endsWith('/') 
			? this.dailyNotePath 
			: this.dailyNotePath + '/';
		return `${dailyNotePath}${today}.md`;
	}

	async createTodayNote(): Promise<TFile> {
		const todayNotePath = this.getTodayNote();
		
		try {
			const existingFile = this.app.vault.getAbstractFileByPath(todayNotePath);
			if (existingFile && (typeof TFile !== 'undefined' && existingFile instanceof TFile || existingFile.path)) {
				this.logger.debug(`Today's note already exists: ${todayNotePath}`);
				return existingFile as TFile;
			}

			// Ensure directory exists
			const dirPath = todayNotePath.substring(0, todayNotePath.lastIndexOf('/'));
			if (dirPath && !this.app.vault.getAbstractFileByPath(dirPath)) {
				await this.app.vault.createFolder(dirPath);
			}

			const today = (moment as any)().format(this.dateFormat);
			const content = `# ${today}\n\n${this.todoSectionHeader}\n\n`;
			
			const newFile = await this.app.vault.create(todayNotePath, content);
			this.logger.info(`Created today's note: ${todayNotePath}`);
			
			return newFile;
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			throw new Error(`Failed to create today's note: ${errorMessage}`);
		}
	}

	async findOrCreateTodoSection(filePath: string): Promise<number> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || (typeof TFile !== 'undefined' && !(file instanceof TFile) && !file.path)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file as TFile);
			const lines = content.split('\n');

			// Look for existing todo section
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].trim() === this.todoSectionHeader) {
					this.logger.debug(`Found existing todo section at line ${i + 1}`);
					return i;
				}
			}

			// Create todo section if not found
			lines.push('', this.todoSectionHeader, '');
			await this.app.vault.modify(file as TFile, lines.join('\n'));
			
			this.logger.info(`Created todo section in ${filePath}`);
			return lines.length - 2; // Return the line number of the header
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			throw new Error(`Failed to find/create todo section: ${errorMessage}`);
		}
	}

	async addTaskToTodoSection(filePath: string, taskTitle: string): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || (typeof TFile !== 'undefined' && !(file instanceof TFile) && !file.path)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file as TFile);
			const lines = content.split('\n');

			// Find todo section
			let todoSectionIndex = -1;
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].trim() === this.todoSectionHeader) {
					todoSectionIndex = i;
					break;
				}
			}

			if (todoSectionIndex === -1) {
				await this.findOrCreateTodoSection(filePath);
				return this.addTaskToTodoSection(filePath, taskTitle);
			}

			// Find insertion point (after header, before next section or end)
			let insertIndex = todoSectionIndex + 1;
			for (let i = todoSectionIndex + 1; i < lines.length; i++) {
				if (lines[i].startsWith('#') && lines[i] !== this.todoSectionHeader) {
					// Found next section
					break;
				}
				if (lines[i].trim() !== '') {
					insertIndex = i + 1;
				}
			}

			// Insert new task
			const taskLine = `- [ ] ${taskTitle}`;
			lines.splice(insertIndex, 0, taskLine);

			await this.app.vault.modify(file as TFile, lines.join('\n'));
			this.logger.info(`Added task to ${filePath}: ${taskTitle}`);
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			throw new Error(`Failed to add task: ${errorMessage}`);
		}
	}

	async parseDailyNoteTodos(filePath: string): Promise<DailyNoteTask[]> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || (typeof TFile !== 'undefined' && !(file instanceof TFile) && !file.path)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file as TFile);
			const lines = content.split('\n');
			const tasks: DailyNoteTask[] = [];

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const checkboxMatch = line.match(/^(\s*)-\s*\[([x\s])\]\s*(.+)/);
				
				if (checkboxMatch) {
					const [, , checked, taskText] = checkboxMatch;
					const isCompleted = checked.toLowerCase() === 'x';
					
					// Extract completion date from DataView format
					const completionMatch = taskText.match(/\[completion::\s*(\d{4}-\d{2}-\d{2})\]/);
					const completionDate = completionMatch ? completionMatch[1] : undefined;
					
					// Remove completion metadata from title
					const title = taskText.replace(/\[completion::\s*\d{4}-\d{2}-\d{2}\]/, '').trim();

					tasks.push({
						title,
						completed: isCompleted,
						line: i,
						completionDate
					});
				}
			}

			this.logger.debug(`Parsed ${tasks.length} tasks from ${filePath}`);
			return tasks;
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			throw new Error(`Failed to parse daily note todos: ${errorMessage}`);
		}
	}

	async updateTaskCompletion(filePath: string, lineNumber: number, completionDate: string): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || (typeof TFile !== 'undefined' && !(file instanceof TFile) && !file.path)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file as TFile);
			const lines = content.split('\n');

			if (lineNumber >= lines.length) {
				throw new Error(`Line number ${lineNumber} is out of range`);
			}

			const line = lines[lineNumber];
			const checkboxMatch = line.match(/^(\s*)-\s*\[([x\s])\]\s*(.+)/);
			
			if (!checkboxMatch) {
				throw new Error(`No checkbox found at line ${lineNumber}`);
			}

			const [, indent, , taskText] = checkboxMatch;
			
			// Remove existing completion metadata
			const cleanTaskText = taskText.replace(/\[completion::\s*\d{4}-\d{2}-\d{2}\]/, '').trim();
			
			// Create new line with completion
			const completionMetadata = `[completion:: ${completionDate}]`;
			lines[lineNumber] = `${indent}- [x] ${cleanTaskText} ${completionMetadata}`;

			await this.app.vault.modify(file as TFile, lines.join('\n'));
			this.logger.info(`Updated task completion at line ${lineNumber + 1}: ${completionDate}`);
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			throw new Error(`Failed to update task completion: ${errorMessage}`);
		}
	}

	isValidDateFormat(dateString: string): boolean {
		const date = (moment as any)(dateString, this.dateFormat, true);
		return date.isValid();
	}

	updateSettings(dailyNotePath: string, dateFormat: string, todoSectionHeader: string): void {
		this.dailyNotePath = dailyNotePath;
		this.dateFormat = dateFormat;
		this.todoSectionHeader = todoSectionHeader;
		this.logger.debug('Updated DailyNoteManager settings');
	}
}