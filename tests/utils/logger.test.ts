import { Logger } from '../../src/utils/logger';

describe('Logger', () => {
	let logger: Logger;

	beforeEach(() => {
		logger = new Logger('info');
		// Mock console methods to avoid test output
		jest.spyOn(console, 'debug').mockImplementation();
		jest.spyOn(console, 'info').mockImplementation();
		jest.spyOn(console, 'error').mockImplementation();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('info', () => {
		it('should log info messages correctly', () => {
			logger.info('Test message');
			
			expect(console.info).toHaveBeenCalledWith('[TodoIntegrator] Test message', '');
		});

		it('should store log entries', () => {
			logger.info('Test message');
			
			const logs = logger.getLogs();
			expect(logs).toHaveLength(1);
			expect(logs[0].level).toBe('info');
			expect(logs[0].message).toBe('Test message');
		});
	});

	describe('error', () => {
		it('should log error messages correctly', () => {
			const error = new Error('Test error');
			logger.error('Error occurred', error);
			
			expect(console.error).toHaveBeenCalledWith('[TodoIntegrator] Error occurred', error);
		});
	});

	describe('debug', () => {
		it('should not log debug messages when log level is info', () => {
			logger.debug('Debug message');
			
			expect(console.debug).not.toHaveBeenCalled();
		});

		it('should log debug messages when log level is debug', () => {
			logger.setLogLevel('debug');
			logger.debug('Debug message');
			
			expect(console.debug).toHaveBeenCalledWith('[TodoIntegrator] Debug message', '');
		});
	});

	describe('setLogLevel', () => {
		it('should update log level correctly', () => {
			logger.setLogLevel('debug');
			logger.debug('Debug message');
			
			expect(console.debug).toHaveBeenCalled();
		});
	});

	describe('getLogs', () => {
		it('should return all logged entries', () => {
			logger.info('Message 1');
			logger.error('Message 2');
			
			const logs = logger.getLogs();
			expect(logs).toHaveLength(2);
			expect(logs[0].message).toBe('Message 1');
			expect(logs[1].message).toBe('Message 2');
		});
	});

	describe('clearLogs', () => {
		it('should clear all log entries', () => {
			logger.info('Message 1');
			logger.clearLogs();
			
			const logs = logger.getLogs();
			expect(logs).toHaveLength(0);
		});
	});
});