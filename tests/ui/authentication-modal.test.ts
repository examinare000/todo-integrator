import { AuthenticationModal } from '../../src/ui/authentication-modal';
import { Logger } from '../../src/utils/logger';
import { ErrorHandler } from '../../src/utils/error-handler';

// Mock Obsidian
jest.mock('obsidian', () => ({
	Modal: class MockModal {
		contentEl = {
			empty: jest.fn(),
			addClass: jest.fn(),
			createEl: jest.fn().mockReturnValue({}),
			createDiv: jest.fn().mockReturnValue({
				hide: jest.fn(),
				show: jest.fn(),
				createEl: jest.fn().mockReturnValue({
					createDiv: jest.fn().mockReturnValue({
						createEl: jest.fn().mockReturnValue({}),
						style: {}
					}),
					createEl: jest.fn().mockReturnValue({})
				}),
				createDiv: jest.fn().mockReturnValue({
					createEl: jest.fn().mockReturnValue({}),
					style: {}
				}),
				style: {}
			}),
			querySelector: jest.fn().mockReturnValue({
				hide: jest.fn(),
				show: jest.fn()
			})
		};
		app = {};
		close = jest.fn();
	},
	ButtonComponent: class MockButtonComponent {
		buttonEl = { textContent: 'Button' };
		setButtonText = jest.fn().mockReturnThis();
		onClick = jest.fn().mockReturnThis();
	}
}));

// Mock clipboard API
Object.assign(navigator, {
	clipboard: {
		writeText: jest.fn().mockResolvedValue(undefined)
	}
});

// Mock window.open
(global as any).window = { open: jest.fn() };

describe('AuthenticationModal', () => {
	let authModal: AuthenticationModal;
	let logger: Logger;
	let errorHandler: ErrorHandler;
	let mockApp: any;

	beforeEach(() => {
		logger = new Logger('error');
		errorHandler = new ErrorHandler(logger);
		mockApp = {};

		authModal = new AuthenticationModal(mockApp, logger, errorHandler);

		// Mock console methods
		jest.spyOn(console, 'info').mockImplementation();
		jest.spyOn(console, 'error').mockImplementation();
		jest.spyOn(console, 'debug').mockImplementation();

		// Reset mocks
		jest.clearAllMocks();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('onOpen', () => {
		it('should open modal and initialize UI elements', () => {
			// Mock the elements that will be created
			const mockProgressEl = {
				empty: jest.fn(),
				createDiv: jest.fn().mockReturnValue({
					createDiv: jest.fn().mockReturnValue({ style: {} })
				}),
				createEl: jest.fn()
			};
			const mockStatusEl = {
				empty: jest.fn(),
				createEl: jest.fn()
			};
			
			authModal.contentEl.createDiv = jest.fn()
				.mockReturnValueOnce(mockProgressEl)
				.mockReturnValueOnce(mockStatusEl)
				.mockReturnValue({ hide: jest.fn() });

			authModal.onOpen();

			expect(authModal.contentEl.empty).toHaveBeenCalled();
			expect(authModal.contentEl.addClass).toHaveBeenCalledWith('auth-modal');
		});
	});

	describe('updateProgress', () => {
		it('should update progress correctly', () => {
			const mockProgressEl = {
				empty: jest.fn(),
				createDiv: jest.fn().mockReturnValue({
					createDiv: jest.fn().mockReturnValue({
						style: {}
					})
				}),
				createEl: jest.fn()
			};
			(authModal as any).progressEl = mockProgressEl;

			authModal.updateProgress(2);

			expect(mockProgressEl.empty).toHaveBeenCalled();
			expect(mockProgressEl.createEl).toHaveBeenCalledWith('p', {
				text: 'ステップ 3/4: ユーザー認証を待機中...',
				cls: 'progress-text'
			});
		});
	});

	describe('core functionality', () => {
		it('should set device code and verification URI', () => {
			authModal.showDeviceCodeInstructions('ABC123', 'https://microsoft.com/devicelogin');
			
			expect((authModal as any).deviceCode).toBe('ABC123');
			expect((authModal as any).verificationUri).toBe('https://microsoft.com/devicelogin');
		});

		it('should show progress message', () => {
			const mockStatusEl = {
				empty: jest.fn(),
				createEl: jest.fn()
			};
			(authModal as any).statusEl = mockStatusEl;

			authModal.showProgress('Loading...');

			expect(mockStatusEl.empty).toHaveBeenCalled();
		});

		it('should handle success state', () => {
			const mockStatusEl = {
				empty: jest.fn(),
				createEl: jest.fn()
			};
			(authModal as any).statusEl = mockStatusEl;
			jest.spyOn(authModal, 'updateProgress').mockImplementation();

			authModal.showSuccess();

			expect(authModal.updateProgress).toHaveBeenCalledWith(3);
		});

		it('should handle error state', () => {
			const mockStatusEl = {
				empty: jest.fn(),
				createEl: jest.fn()
			};
			(authModal as any).statusEl = mockStatusEl;

			authModal.showError('Authentication failed');

			expect(mockStatusEl.empty).toHaveBeenCalled();
		});
	});

	describe('onClose', () => {
		it('should clean up modal content', () => {
			authModal.onClose();

			expect(authModal.contentEl.empty).toHaveBeenCalled();
		});
	});
});