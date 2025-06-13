import { SidebarButton } from '../../src/ui/sidebar-button';
import { Logger } from '../../src/utils/logger';
import { ErrorHandler } from '../../src/utils/error-handler';

// Mock Obsidian
jest.mock('obsidian', () => ({
	Component: class MockComponent {
		load() {}
		unload() {}
	},
	setIcon: jest.fn()
}));

describe('SidebarButton', () => {
	let sidebarButton: SidebarButton;
	let logger: Logger;
	let errorHandler: ErrorHandler;
	let mockSyncCallback: jest.Mock;
	let mockApp: any;
	let mockParentElement: any;

	beforeEach(() => {
		logger = new Logger('error');
		errorHandler = new ErrorHandler(logger);
		mockSyncCallback = jest.fn();
		mockApp = {};

		// Mock DOM elements
		mockParentElement = {
			createDiv: jest.fn().mockReturnValue({
				createEl: jest.fn().mockReturnValue({
					createSpan: jest.fn().mockReturnValue({}),
					addEventListener: jest.fn(),
					disabled: false
				}),
				createDiv: jest.fn().mockReturnValue({
					empty: jest.fn(),
					createSpan: jest.fn().mockReturnValue({})
				})
			})
		};

		sidebarButton = new SidebarButton(mockApp, logger, errorHandler, mockSyncCallback);

		// Mock console methods
		jest.spyOn(console, 'info').mockImplementation();
		jest.spyOn(console, 'error').mockImplementation();
		jest.spyOn(console, 'debug').mockImplementation();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('createSyncButton', () => {
		it('should create sync button correctly', () => {
			const result = sidebarButton.createSyncButton(mockParentElement);

			expect(mockParentElement.createDiv).toHaveBeenCalledWith('todo-sync-container');
			expect(result).toBeDefined();
		});
	});

	describe('onSyncButtonClick', () => {
		beforeEach(() => {
			sidebarButton.createSyncButton(mockParentElement);
		});

		it('should execute sync callback successfully', async () => {
			mockSyncCallback.mockResolvedValue(undefined);
			jest.spyOn(sidebarButton, 'updateSyncStatus').mockImplementation();
			jest.spyOn(sidebarButton, 'showSyncProgress').mockImplementation();

			await sidebarButton.onSyncButtonClick();

			expect(mockSyncCallback).toHaveBeenCalled();
			expect(sidebarButton.showSyncProgress).toHaveBeenCalled();
			expect(sidebarButton.updateSyncStatus).toHaveBeenCalledWith('success');
		});

		it('should handle sync errors', async () => {
			const error = new Error('Sync failed');
			mockSyncCallback.mockRejectedValue(error);
			jest.spyOn(sidebarButton, 'updateSyncStatus').mockImplementation();
			jest.spyOn(sidebarButton, 'showSyncProgress').mockImplementation();

			await sidebarButton.onSyncButtonClick();

			expect(sidebarButton.updateSyncStatus).toHaveBeenCalledWith('error', expect.any(String));
		});

		it('should prevent multiple simultaneous syncs', async () => {
			// Set up to simulate sync in progress
			(sidebarButton as any).isSync = true;
			
			await sidebarButton.onSyncButtonClick();

			expect(mockSyncCallback).not.toHaveBeenCalled();
		});
	});

	describe('updateSyncStatus', () => {
		beforeEach(() => {
			sidebarButton.createSyncButton(mockParentElement);
		});

		it('should update status to idle', () => {
			const mockStatusEl = {
				empty: jest.fn(),
				createSpan: jest.fn().mockReturnValue({}),
				className: ''
			};
			(sidebarButton as any).statusEl = mockStatusEl;

			sidebarButton.updateSyncStatus('idle');

			expect(mockStatusEl.className).toBe('sync-status sync-status-idle');
			expect(mockStatusEl.createSpan).toHaveBeenCalledTimes(2); // icon + text
		});

		it('should update status to syncing', () => {
			const mockStatusEl = {
				empty: jest.fn(),
				createSpan: jest.fn().mockReturnValue({}),
				className: ''
			};
			const mockButtonEl = { disabled: false };
			(sidebarButton as any).statusEl = mockStatusEl;
			(sidebarButton as any).buttonEl = mockButtonEl;

			sidebarButton.updateSyncStatus('syncing');

			expect(mockStatusEl.className).toBe('sync-status sync-status-syncing');
			expect(mockButtonEl.disabled).toBe(true);
		});

		it('should update status to success', () => {
			const mockStatusEl = {
				empty: jest.fn(),
				createSpan: jest.fn().mockReturnValue({}),
				className: ''
			};
			const mockButtonEl = { disabled: true };
			(sidebarButton as any).statusEl = mockStatusEl;
			(sidebarButton as any).buttonEl = mockButtonEl;

			sidebarButton.updateSyncStatus('success');

			expect(mockStatusEl.className).toBe('sync-status sync-status-success');
			expect(mockButtonEl.disabled).toBe(false);
		});

		it('should update status to error with message', () => {
			const mockStatusEl = {
				empty: jest.fn(),
				createSpan: jest.fn().mockReturnValue({}),
				className: ''
			};
			(sidebarButton as any).statusEl = mockStatusEl;

			sidebarButton.updateSyncStatus('error', 'Custom error message');

			expect(mockStatusEl.className).toBe('sync-status sync-status-error');
			expect(mockStatusEl.createSpan).toHaveBeenCalledWith('status-text', { 
				text: 'Error: Custom error message' 
			});
		});
	});

	describe('showSyncProgress', () => {
		it('should call updateSyncStatus with syncing', () => {
			jest.spyOn(sidebarButton, 'updateSyncStatus').mockImplementation();

			sidebarButton.showSyncProgress();

			expect(sidebarButton.updateSyncStatus).toHaveBeenCalledWith('syncing');
		});
	});
});