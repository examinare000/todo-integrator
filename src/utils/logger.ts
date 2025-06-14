import { LogEntry } from '../types';

export class Logger {
	private logLevel: 'debug' | 'info' | 'error';
	private logs: LogEntry[] = [];

	constructor(logLevel: 'debug' | 'info' | 'error' = 'info') {
		this.logLevel = logLevel;
	}

	setLogLevel(level: 'debug' | 'info' | 'error'): void {
		this.logLevel = level;
	}

	debug(message: string, context?: any): void {
		if (this.shouldLog('debug')) {
			this.addLog('debug', message, context);
			console.debug(`[TodoIntegrator] ${message}`, context || '');
		}
	}

	info(message: string, context?: any): void {
		if (this.shouldLog('info')) {
			this.addLog('info', message, context);
			console.info(`[TodoIntegrator] ${message}`, context || '');
		}
	}

	error(message: string, error?: Error | any): void {
		if (this.shouldLog('error')) {
			this.addLog('error', message, error);
			console.error(`[TodoIntegrator] ${message}`, error || '');
		}
	}

	private shouldLog(level: 'debug' | 'info' | 'error'): boolean {
		const levels = { debug: 0, info: 1, error: 2 };
		return levels[level] >= levels[this.logLevel];
	}

	private addLog(level: 'debug' | 'info' | 'error', message: string, context?: any): void {
		this.logs.push({
			timestamp: new Date(),
			level,
			message,
			context
		});

		// Keep only last 1000 entries
		if (this.logs.length > 1000) {
			this.logs = this.logs.slice(-1000);
		}
	}

	getLogs(): LogEntry[] {
		return [...this.logs];
	}

	clearLogs(): void {
		this.logs = [];
	}
}