import { Client } from '@microsoft/microsoft-graph-client';
import { TodoTask } from '../types';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';
import 'isomorphic-fetch';

export class TodoApiClient {
	private graphClient: Client | null = null;
	private listId: string | null = null;
	private logger: Logger;
	private errorHandler: ErrorHandler;

	constructor(logger: Logger, errorHandler: ErrorHandler) {
		this.logger = logger;
		this.errorHandler = errorHandler;
	}

	initialize(accessToken: string): void {
		this.graphClient = Client.init({
			authProvider: async (done) => {
				try {
					done(null, `Bearer ${accessToken}`);
				} catch (error) {
					done(error, null);
				}
			}
		});

		this.logger.info('Graph client initialized');
	}

	async getOrCreateTaskList(listName: string = 'Obsidian Tasks'): Promise<string> {
		if (!this.graphClient) {
			throw new Error('Graph client not initialized');
		}

		try {
			const lists = await this.graphClient.api('/me/todo/lists').get();
			let obsidianList = lists.value.find((list: any) => list.displayName === listName);
			
			if (!obsidianList) {
				this.logger.info(`Creating new task list: ${listName}`);
				obsidianList = await this.graphClient.api('/me/todo/lists').post({
					displayName: listName
				});
			}
			
			this.listId = obsidianList.id || '';
			this.logger.info(`Using task list: ${listName} (ID: ${this.listId})`);
			
			return this.listId || '';
		} catch (error) {
			const errorMessage = this.errorHandler.handleApiError(error);
			throw new Error(`Failed to get/create task list: ${errorMessage}`);
		}
	}

	async getTasks(): Promise<TodoTask[]> {
		if (!this.graphClient || !this.listId) {
			throw new Error('Graph client or list ID not initialized');
		}

		try {
			const response = await this.graphClient
				.api(`/me/todo/lists/${this.listId}/tasks`)
				.select('id,title,body,startDateTime,dueDateTime,status,createdDateTime,completedDateTime')
				.get();

			const tasks: TodoTask[] = response.value.map((task: any) => ({
				id: task.id,
				title: task.title,
				body: task.body?.content || task.body,
				startDateTime: task.startDateTime?.dateTime,
				dueDateTime: task.dueDateTime?.dateTime,
				status: task.status,
				createdDateTime: task.createdDateTime,
				completedDateTime: task.completedDateTime?.dateTime
			}));

			this.logger.debug(`Retrieved ${tasks.length} tasks from Microsoft Todo`);
			return tasks;
		} catch (error) {
			const errorMessage = this.errorHandler.handleApiError(error);
			throw new Error(`Failed to get tasks: ${errorMessage}`);
		}
	}

	async createTask(title: string, startDate?: string): Promise<TodoTask> {
		if (!this.graphClient || !this.listId) {
			throw new Error('Graph client or list ID not initialized');
		}

		if (!title || title.trim().length === 0) {
			throw new Error('Task title cannot be empty');
		}

		try {
			const task: any = {
				title: title.trim(),
				status: 'notStarted'
			};

			if (startDate) {
				task.startDateTime = {
					dateTime: `${startDate}T09:00:00.000Z`,
					timeZone: 'UTC'
				};
			}

			const createdTask = await this.graphClient
				.api(`/me/todo/lists/${this.listId}/tasks`)
				.post(task);

			const result: TodoTask = {
				id: createdTask.id,
				title: createdTask.title,
				body: createdTask.body?.content || createdTask.body,
				startDateTime: createdTask.startDateTime?.dateTime,
				dueDateTime: createdTask.dueDateTime?.dateTime,
				status: createdTask.status,
				createdDateTime: createdTask.createdDateTime,
				completedDateTime: createdTask.completedDateTime?.dateTime
			};

			this.logger.info(`Created task: ${title}`);
			return result;
		} catch (error) {
			const errorMessage = this.errorHandler.handleApiError(error);
			throw new Error(`Failed to create task: ${errorMessage}`);
		}
	}

	async completeTask(taskId: string): Promise<void> {
		if (!this.graphClient || !this.listId) {
			throw new Error('Graph client or list ID not initialized');
		}

		if (!taskId) {
			throw new Error('Task ID cannot be empty');
		}

		try {
			await this.graphClient
				.api(`/me/todo/lists/${this.listId}/tasks/${taskId}`)
				.patch({
					status: 'completed'
				});

			this.logger.info(`Completed task: ${taskId}`);
		} catch (error) {
			if (error?.response?.status === 404) {
				throw new Error(`Task not found: ${taskId}`);
			}
			const errorMessage = this.errorHandler.handleApiError(error);
			throw new Error(`Failed to complete task: ${errorMessage}`);
		}
	}

	async deleteTask(taskId: string): Promise<void> {
		if (!this.graphClient || !this.listId) {
			throw new Error('Graph client or list ID not initialized');
		}

		if (!taskId) {
			throw new Error('Task ID cannot be empty');
		}

		try {
			await this.graphClient
				.api(`/me/todo/lists/${this.listId}/tasks/${taskId}`)
				.delete();

			this.logger.info(`Deleted task: ${taskId}`);
		} catch (error) {
			if (error?.response?.status === 404) {
				throw new Error(`Task not found: ${taskId}`);
			}
			const errorMessage = this.errorHandler.handleApiError(error);
			throw new Error(`Failed to delete task: ${errorMessage}`);
		}
	}

	getListId(): string | null {
		return this.listId;
	}

	async getUserInfo(): Promise<{ email: string; displayName: string }> {
		if (!this.graphClient) {
			throw new Error('Graph client not initialized');
		}

		try {
			const user = await this.graphClient.api('/me').select('mail,userPrincipalName,displayName').get();
			
			const userInfo = {
				email: user.mail || user.userPrincipalName || '',
				displayName: user.displayName || 'Microsoft User'
			};

			this.logger.info(`Retrieved user info: ${userInfo.displayName} (${userInfo.email})`);
			return userInfo;
		} catch (error) {
			const errorMessage = this.errorHandler.handleApiError(error);
			throw new Error(`Failed to get user info: ${errorMessage}`);
		}
	}

	isInitialized(): boolean {
		return this.graphClient !== null && this.listId !== null;
	}
}