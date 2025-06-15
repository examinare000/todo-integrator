export interface TodoIntegratorSettings {
	// Azure Configuration
	clientId: string;
	tenantId: string;
	
	// Authentication
	accessToken: string;
	refreshToken: string;
	tokenExpiry: number;
	userEmail: string;
	userName: string;
	
	// Daily Note settings
	dailyNotePath: string;
	dateFormat: string;
	todoSectionHeader: string;
	
	// Sync settings
	syncInterval: number;
	autoSync: boolean;
	
	// Logging
	logLevel: 'debug' | 'info' | 'error';
}

export interface TodoTask {
	id?: string;
	title: string;
	body?: string;
	startDateTime?: string;
	dueDateTime?: string;
	status: 'notStarted' | 'inProgress' | 'completed';
	createdDateTime?: string;
	completedDateTime?: string;
}

export interface ObsidianTask {
	file: string;
	line: number;
	text: string;
	completed: boolean;
	completionDate?: string;
	dueDate?: string;
	todoId?: string;
}

export interface DailyNoteTask {
	title: string;
	completed: boolean;
	line: number;
	completionDate?: string;
}

export interface SyncResult {
	success: boolean;
	newTasksFromMsft: number;
	newTasksFromObsidian: number;
	completedTasks: number;
	errors: string[];
}

export interface LogEntry {
	timestamp: Date;
	level: 'debug' | 'info' | 'error';
	message: string;
	context?: any;
}

export const DEFAULT_SETTINGS: TodoIntegratorSettings = {
	clientId: '',
	tenantId: 'common',
	accessToken: '',
	refreshToken: '',
	tokenExpiry: 0,
	userEmail: '',
	userName: '',
	dailyNotePath: 'Daily Notes',
	dateFormat: 'YYYY-MM-DD',
	todoSectionHeader: '## ToDo',
	syncInterval: 300000, // 5 minutes
	autoSync: true,
	logLevel: 'info'
};