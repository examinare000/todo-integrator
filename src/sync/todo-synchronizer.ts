// Use native Date instead of moment for better compatibility
import { TodoApiClient } from '../api/todo-api-client';
import { DailyNoteManager } from '../daily-note/daily-note-manager';
import { ObsidianTodoParser } from '../parser/obsidian-todo-parser';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';
import { TodoTask, ObsidianTask, DailyNoteTask, SyncResult } from '../types';

export class TodoSynchronizer {
	private todoApiClient: TodoApiClient;
	private dailyNoteManager: DailyNoteManager;
	private obsidianTodoParser: ObsidianTodoParser;
	private logger: Logger;
	private errorHandler: ErrorHandler;

	constructor(
		todoApiClient: TodoApiClient,
		dailyNoteManager: DailyNoteManager,
		obsidianTodoParser: ObsidianTodoParser,
		logger: Logger,
		errorHandler: ErrorHandler
	) {
		this.todoApiClient = todoApiClient;
		this.dailyNoteManager = dailyNoteManager;
		this.obsidianTodoParser = obsidianTodoParser;
		this.logger = logger;
		this.errorHandler = errorHandler;
	}

	async syncMsftToObsidian(): Promise<{ newTasks: number; errors: string[] }> {
		const result = { newTasks: 0, errors: [] as string[] };

		try {
			this.logger.info('Starting Microsoft Todo → Obsidian sync');

			// Get all Microsoft Todo tasks
			const msftTasks = await this.todoApiClient.getTasks();
			this.logger.debug(`Found ${msftTasks.length} Microsoft Todo tasks`);

			// Get today's Daily Note
			const todayNote = await this.dailyNoteManager.createTodayNote();
			const todayNotePath = todayNote.path;

			// Get existing tasks from today's note
			const existingTasks = await this.dailyNoteManager.parseDailyNoteTodos(todayNotePath);
			
			// Find new tasks that don't exist in Obsidian
			const newMsftTasks = this.filterNewTasks(msftTasks, existingTasks);

			// Add new tasks to Daily Note
			for (const task of newMsftTasks) {
				try {
					await this.dailyNoteManager.addTaskToTodoSection(todayNotePath, task.title);
					result.newTasks++;
					this.logger.info(`Added task from Microsoft Todo: ${task.title}`);
				} catch (error) {
					const errorMessage = this.errorHandler.handleFileError(error);
					result.errors.push(`Failed to add task "${task.title}": ${errorMessage}`);
				}
			}

			this.logger.info(`Microsoft Todo → Obsidian sync completed: ${result.newTasks} new tasks`);
		} catch (error) {
			const errorMessage = this.errorHandler.handleApiError(error);
			result.errors.push(`Microsoft Todo sync failed: ${errorMessage}`);
			this.logger.error('Microsoft Todo → Obsidian sync failed', error);
		}

		return result;
	}

	async syncObsidianToMsft(): Promise<{ newTasks: number; errors: string[] }> {
		const result = { newTasks: 0, errors: [] as string[] };

		try {
			this.logger.info('Starting Obsidian → Microsoft Todo sync');

			// Get today's Daily Note
			const todayNotePath = this.dailyNoteManager.getTodayNote();
			const dailyNoteTasks = await this.dailyNoteManager.parseDailyNoteTodos(todayNotePath);

			// Filter incomplete tasks only
			const incompleteTasks = dailyNoteTasks.filter(task => !task.completed);
			this.logger.debug(`Found ${incompleteTasks.length} incomplete Obsidian tasks`);

			if (incompleteTasks.length === 0) {
				this.logger.info('No incomplete tasks found in Daily Note');
				return result;
			}

			// Get existing Microsoft Todo tasks
			const msftTasks = await this.todoApiClient.getTasks();
			
			// Find tasks that don't exist in Microsoft Todo
			const newObsidianTasks = this.filterNewObsidianTasks(incompleteTasks, msftTasks);

			// Get file modification date for start date
			const fileModDate = await this.obsidianTodoParser.getFileModificationDate(todayNotePath);
			const startDate = fileModDate.toISOString().split('T')[0]; // YYYY-MM-DD format

			// Create new tasks in Microsoft Todo
			for (const task of newObsidianTasks) {
				try {
					await this.todoApiClient.createTask(task.title, startDate);
					result.newTasks++;
					this.logger.info(`Created task in Microsoft Todo: ${task.title}`);
				} catch (error) {
					const errorMessage = this.errorHandler.handleApiError(error);
					result.errors.push(`Failed to create task "${task.title}": ${errorMessage}`);
				}
			}

			this.logger.info(`Obsidian → Microsoft Todo sync completed: ${result.newTasks} new tasks`);
		} catch (error) {
			const errorMessage = this.errorHandler.handleFileError(error);
			result.errors.push(`Obsidian sync failed: ${errorMessage}`);
			this.logger.error('Obsidian → Microsoft Todo sync failed', error);
		}

		return result;
	}

	async syncCompletions(): Promise<{ completedTasks: number; errors: string[] }> {
		const result = { completedTasks: 0, errors: [] as string[] };

		try {
			this.logger.info('Starting completion status sync');

			// Get tasks from both sides
			const todayNotePath = this.dailyNoteManager.getTodayNote();
			const dailyNoteTasks = await this.dailyNoteManager.parseDailyNoteTodos(todayNotePath);
			const msftTasks = await this.todoApiClient.getTasks();

			// Sync completions from Microsoft Todo to Obsidian
			for (const msftTask of msftTasks) {
				if (msftTask.status === 'completed' && msftTask.completedDateTime) {
					const matchingObsidianTask = dailyNoteTasks.find(
						obsTask => obsTask.title.trim().toLowerCase() === msftTask.title.trim().toLowerCase()
					);

					if (matchingObsidianTask && !matchingObsidianTask.completed) {
						try {
							const completionDate = new Date(msftTask.completedDateTime).toISOString().split('T')[0];
							await this.dailyNoteManager.updateTaskCompletion(
								todayNotePath, 
								matchingObsidianTask.line, 
								completionDate
							);
							result.completedTasks++;
							this.logger.info(`Completed Obsidian task: ${msftTask.title}`);
						} catch (error) {
							const errorMessage = this.errorHandler.handleFileError(error);
							result.errors.push(`Failed to complete Obsidian task "${msftTask.title}": ${errorMessage}`);
						}
					}
				}
			}

			// Sync completions from Obsidian to Microsoft Todo
			for (const obsTask of dailyNoteTasks) {
				if (obsTask.completed && obsTask.completionDate) {
					const matchingMsftTask = msftTasks.find(
						msftTask => msftTask.title.trim().toLowerCase() === obsTask.title.trim().toLowerCase()
					);

					if (matchingMsftTask && matchingMsftTask.status !== 'completed') {
						try {
							await this.todoApiClient.completeTask(matchingMsftTask.id!);
							result.completedTasks++;
							this.logger.info(`Completed Microsoft Todo task: ${obsTask.title}`);
						} catch (error) {
							const errorMessage = this.errorHandler.handleApiError(error);
							result.errors.push(`Failed to complete Microsoft Todo task "${obsTask.title}": ${errorMessage}`);
						}
					}
				}
			}

			this.logger.info(`Completion sync completed: ${result.completedTasks} tasks updated`);
		} catch (error) {
			const errorMessage = this.errorHandler.handleApiError(error);
			result.errors.push(`Completion sync failed: ${errorMessage}`);
			this.logger.error('Completion sync failed', error);
		}

		return result;
	}

	findDuplicateTasks(obsidianTasks: DailyNoteTask[], msftTasks: TodoTask[]): DailyNoteTask[] {
		const msftTaskTitles = new Set(
			msftTasks.map(task => task.title.trim().toLowerCase())
		);

		return obsidianTasks.filter(
			obsTask => !msftTaskTitles.has(obsTask.title.trim().toLowerCase())
		);
	}

	filterNewObsidianTasks(obsidianTasks: DailyNoteTask[], msftTasks: TodoTask[]): DailyNoteTask[] {
		const msftTaskTitles = new Set(
			msftTasks.map(task => task.title.trim().toLowerCase())
		);

		return obsidianTasks.filter(
			obsTask => !msftTaskTitles.has(obsTask.title.trim().toLowerCase())
		);
	}

	filterNewTasks(msftTasks: TodoTask[], existingObsidianTasks: DailyNoteTask[]): TodoTask[] {
		const obsidianTaskTitles = new Set(
			existingObsidianTasks.map(task => task.title.trim().toLowerCase())
		);

		return msftTasks.filter(
			msftTask => !obsidianTaskTitles.has(msftTask.title.trim().toLowerCase())
		);
	}

	async handleSyncConflicts(conflicts: any[]): Promise<void> {
		// For now, log conflicts - in future could implement resolution strategies
		for (const conflict of conflicts) {
			this.logger.info(`Sync conflict detected: ${JSON.stringify(conflict)}`);
		}
	}

	async performFullSync(): Promise<SyncResult> {
		this.logger.info('Starting full bidirectional sync');

		const msftToObsidian = await this.syncMsftToObsidian();
		const obsidianToMsft = await this.syncObsidianToMsft();
		const completions = await this.syncCompletions();

		const result: SyncResult = {
			success: msftToObsidian.errors.length === 0 && 
					 obsidianToMsft.errors.length === 0 && 
					 completions.errors.length === 0,
			newTasksFromMsft: msftToObsidian.newTasks,
			newTasksFromObsidian: obsidianToMsft.newTasks,
			completedTasks: completions.completedTasks,
			errors: [
				...msftToObsidian.errors,
				...obsidianToMsft.errors,
				...completions.errors
			]
		};

		this.logger.info(`Full sync completed - Success: ${result.success}, ` +
			`New from Microsoft Todo: ${result.newTasksFromMsft}, ` +
			`New from Obsidian: ${result.newTasksFromObsidian}, ` +
			`Completed: ${result.completedTasks}, ` +
			`Errors: ${result.errors.length}`);

		return result;
	}
}