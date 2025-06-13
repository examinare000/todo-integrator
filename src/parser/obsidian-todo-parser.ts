import { App, TFile } from 'obsidian';
import { ObsidianTask } from '../types';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';

export class ObsidianTodoParser {
	private app: App;
	private logger: Logger;
	private errorHandler: ErrorHandler;

	constructor(app: App, logger: Logger, errorHandler: ErrorHandler) {
		this.app = app;
		this.logger = logger;
		this.errorHandler = errorHandler;
	}

	async parseFileTodos(filePath: string): Promise<ObsidianTask[]> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const tasks: ObsidianTask[] = [];

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const checkboxMatch = line.match(/^(\s*)-\s*\[([x\s])\]\s*(.+)/);
				
				if (checkboxMatch) {
					const [, , checked, taskText] = checkboxMatch;
					const isCompleted = checked.toLowerCase() === 'x';
					
					// Extract completion date from DataView format
					const completionMatch = taskText.match(/\[completion::\s*(\d{4}-\d{2}-\d{2})\]/);
					const completionDate = completionMatch ? completionMatch[1] : undefined;
					
					// Extract due date
					const dueDateMatch = taskText.match(/due:\s*(\d{4}-\d{2}-\d{2})/);
					const dueDate = dueDateMatch ? dueDateMatch[1] : undefined;
					
					// Extract clean title
					const title = this.extractTaskTitle(taskText);

					tasks.push({
						file: filePath,
						line: i,
						text: title,
						completed: isCompleted,
						completionDate,
						dueDate
					});
				}
			}

			this.logger.debug(`Parsed ${tasks.length} tasks from ${filePath}`);
			return tasks;
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			throw new Error(`Failed to parse file todos: ${errorMessage}`);
		}
	}

	async updateCheckboxStatus(filePath: string, lineNumber: number, completed: boolean, completionDate?: string): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}

			const content = await this.app.vault.read(file);
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
			
			// Build new line
			const checkMark = completed ? 'x' : ' ';
			let newLine = `${indent}- [${checkMark}] ${cleanTaskText}`;

			// Add completion date if task is completed
			if (completed && completionDate) {
				newLine += ` [completion:: ${completionDate}]`;
			}

			lines[lineNumber] = newLine;

			await this.app.vault.modify(file, lines.join('\n'));
			this.logger.info(`Updated checkbox at ${filePath}:${lineNumber + 1} - completed: ${completed}`);
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			throw new Error(`Failed to update checkbox status: ${errorMessage}`);
		}
	}

	async getFileModificationDate(filePath: string): Promise<Date> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				throw new Error(`File not found: ${filePath}`);
			}

			return new Date(file.stat.mtime);
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			throw new Error(`Failed to get file modification date: ${errorMessage}`);
		}
	}

	extractTaskTitle(taskLine: string): string {
		// Remove completion metadata
		let title = taskLine.replace(/\[completion::\s*\d{4}-\d{2}-\d{2}\]/, '');
		
		// Remove due date metadata
		title = title.replace(/due:\s*\d{4}-\d{2}-\d{2}/, '');
		
		// Remove other common metadata patterns
		title = title.replace(/#\w+/g, ''); // Remove hashtags
		title = title.replace(/\[\[.*?\]\]/g, ''); // Remove wiki links
		title = title.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove bold formatting
		title = title.replace(/(?<!\*)\*(.*?)\*(?!\*)/g, '$1'); // Remove italic formatting (not bold)
		
		return title.trim();
	}
}