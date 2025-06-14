import { ErrorHandler } from '../../src/utils/error-handler';
import { Logger } from '../../src/utils/logger';

describe('ErrorHandler', () => {
	let errorHandler: ErrorHandler;
	let mockLogger: Logger;

	beforeEach(() => {
		mockLogger = new Logger('error');
		jest.spyOn(mockLogger, 'error').mockImplementation();
		errorHandler = new ErrorHandler(mockLogger);
	});

	describe('handleApiError', () => {
		it('should handle 401 error correctly', () => {
			const error = { response: { status: 401, statusText: 'Unauthorized' } };
			const result = errorHandler.handleApiError(error);
			
			expect(result).toBe('Authentication failed. Please re-authenticate.');
		});

		it('should handle 403 error correctly', () => {
			const error = { response: { status: 403, statusText: 'Forbidden' } };
			const result = errorHandler.handleApiError(error);
			
			expect(result).toBe('Access denied. Check your permissions.');
		});

		it('should handle 404 error correctly', () => {
			const error = { response: { status: 404, statusText: 'Not Found' } };
			const result = errorHandler.handleApiError(error);
			
			expect(result).toBe('Resource not found.');
		});

		it('should handle unknown API error correctly', () => {
			const error = { message: 'Custom error message' };
			const result = errorHandler.handleApiError(error);
			
			expect(result).toBe('Custom error message');
		});
	});

	describe('handleNetworkError', () => {
		it('should return network error message', () => {
			const error = new Error('Network failure');
			const result = errorHandler.handleNetworkError(error);
			
			expect(result).toBe('Network error. Please check your internet connection.');
		});
	});

	describe('handleFileError', () => {
		it('should handle ENOENT error correctly', () => {
			const error = new Error('ENOENT: no such file or directory');
			const result = errorHandler.handleFileError(error);
			
			expect(result).toBe('File not found');
		});

		it('should handle EACCES error correctly', () => {
			const error = new Error('EACCES: permission denied');
			const result = errorHandler.handleFileError(error);
			
			expect(result).toBe('Permission denied');
		});

		it('should handle generic file error correctly', () => {
			const error = new Error('Custom file error');
			const result = errorHandler.handleFileError(error);
			
			expect(result).toBe('File error: Custom file error');
		});
	});

	describe('logError', () => {
		it('should log error with context', () => {
			const error = new Error('Test error');
			errorHandler.logError('Test message', 'TestContext', error);
			
			expect(mockLogger.error).toHaveBeenCalledWith('TestContext: Test message', error);
		});
	});
});