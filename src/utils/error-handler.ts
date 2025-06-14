import { Logger } from './logger';

export class ErrorHandler {
	private logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	handleApiError(error: any): string {
		let errorMessage = 'Unknown API error occurred';
		
		if (error?.response?.status) {
			switch (error.response.status) {
				case 401:
					errorMessage = 'Authentication failed. Please re-authenticate.';
					break;
				case 403:
					errorMessage = 'Access denied. Check your permissions.';
					break;
				case 404:
					errorMessage = 'Resource not found.';
					break;
				case 429:
					errorMessage = 'Rate limit exceeded. Please try again later.';
					break;
				case 500:
					errorMessage = 'Server error. Please try again later.';
					break;
				default:
					errorMessage = `API error (${error.response.status}): ${error.response.statusText}`;
			}
		} else if (error?.message) {
			errorMessage = error.message;
		}

		this.logError(errorMessage, 'API', error);
		return errorMessage;
	}

	handleNetworkError(error: any): string {
		const errorMessage = 'Network error. Please check your internet connection.';
		this.logError(errorMessage, 'Network', error);
		return errorMessage;
	}

	handleFileError(error: any): string {
		let errorMessage = 'File operation failed';
		
		if (error?.message) {
			if (error.message.includes('ENOENT')) {
				errorMessage = 'File not found';
			} else if (error.message.includes('EACCES')) {
				errorMessage = 'Permission denied';
			} else {
				errorMessage = `File error: ${error.message}`;
			}
		}

		this.logError(errorMessage, 'File', error);
		return errorMessage;
	}

	logError(message: string, context: string, error?: any): void {
		this.logger.error(`${context}: ${message}`, error);
	}
}