import { App, Modal, ButtonComponent } from 'obsidian';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/error-handler';

export class AuthenticationModal extends Modal {
	private logger: Logger;
	private errorHandler: ErrorHandler;
	private progressEl: HTMLElement;
	private instructionsEl: HTMLElement;
	private statusEl: HTMLElement;
	private copyButton: ButtonComponent;
	private currentStep: number = 0;
	private deviceCode: string = '';
	private verificationUri: string = '';

	constructor(app: App, logger: Logger, errorHandler: ErrorHandler) {
		super(app);
		this.logger = logger;
		this.errorHandler = errorHandler;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('auth-modal');

		contentEl.createEl('h2', { text: 'Microsoft アカウント認証' });

		this.progressEl = contentEl.createDiv('auth-progress');
		this.updateProgress(0);

		this.statusEl = contentEl.createDiv('auth-status');
		this.statusEl.createEl('p', { text: '認証を開始しています...' });

		this.instructionsEl = contentEl.createDiv('auth-instructions');
		this.instructionsEl.hide();

		const buttonContainer = contentEl.createDiv('auth-buttons');
		buttonContainer.hide();

		this.copyButton = new ButtonComponent(buttonContainer)
			.setButtonText('認証コードをコピー')
			.onClick(() => {
				navigator.clipboard.writeText(this.deviceCode);
				// Show copied feedback
				const originalText = this.copyButton.buttonEl.textContent;
				this.copyButton.setButtonText('コピーしました！');
				setTimeout(() => {
					this.copyButton.setButtonText(originalText || '認証コードをコピー');
				}, 2000);
				this.logger.debug('Device code copied to clipboard');
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('ブラウザーで開く')
			.onClick(() => {
				if (this.verificationUri) {
					window.open(this.verificationUri, '_blank');
					this.logger.debug('Opened verification URL in browser');
				}
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('キャンセル')
			.onClick(() => {
				this.logger.info('Authentication cancelled by user');
				this.close();
			});

		this.logger.debug('Authentication modal opened');
	}

	updateProgress(step: number): void {
		this.currentStep = step;
		const steps = [
			'認証を開始中...',
			'認証コードを生成中...',
			'ユーザー認証を待機中...',
			'認証完了'
		];

		this.progressEl.empty();
		
		const progressBar = this.progressEl.createDiv('progress-bar');
		const progressFill = progressBar.createDiv('progress-fill');
		progressFill.style.width = `${(step / 3) * 100}%`;

		this.progressEl.createEl('p', { 
			text: `ステップ ${step + 1}/4: ${steps[step]}`,
			cls: 'progress-text'
		});

		this.logger.debug(`Authentication progress: step ${step + 1}/4`);
	}

	showDeviceCodeInstructions(userCode: string, verificationUri: string): void {
		this.deviceCode = userCode;
		this.verificationUri = verificationUri;
		
		this.updateProgress(1);
		
		this.statusEl.empty();
		this.statusEl.createEl('h3', { text: '認証手順' });
		
		const instructions = this.statusEl.createDiv('device-code-instructions');
		instructions.createEl('p', { text: '以下の手順で認証を完了してください：' });
		
		const stepsList = instructions.createEl('ol');
		stepsList.createEl('li', { text: '下の「ブラウザーで開く」ボタンをクリック' });
		stepsList.createEl('li', { text: 'Microsoft ログインページにサインイン' });
		stepsList.createEl('li', { text: '以下の認証コードを入力：' });
		
		const codeDisplay = instructions.createDiv('code-display');
		codeDisplay.createEl('code', { text: userCode, cls: 'device-code' });
		
		instructions.createEl('p', { 
			text: '認証が完了するまでこのウィンドウを開いたままにしてください。',
			cls: 'auth-note'
		});
		
		this.instructionsEl.show();
		const buttonContainer = this.contentEl.querySelector('.auth-buttons') as HTMLElement;
		if (buttonContainer) buttonContainer.show();
		
		this.updateProgress(2);
		this.logger.info(`Device code authentication initiated: ${userCode}`);
	}

	showProgress(message: string): void {
		this.statusEl.empty();
		this.statusEl.createEl('p', { text: message });
		this.logger.debug(`Authentication progress: ${message}`);
	}

	showSuccess(): void {
		this.updateProgress(3);
		this.statusEl.empty();
		this.statusEl.createEl('h3', { text: '認証成功！', cls: 'success-title' });
		this.statusEl.createEl('p', { text: 'Microsoft Todo との連携が完了しました。' });
		
		const buttonContainer = this.contentEl.querySelector('.auth-buttons') as HTMLElement;
		if (buttonContainer) buttonContainer.hide();
		
		this.logger.info('Authentication completed successfully');
		
		setTimeout(() => {
			this.close();
		}, 2000);
	}

	showError(error: string): void {
		this.statusEl.empty();
		this.statusEl.createEl('h3', { text: '認証エラー', cls: 'error-title' });
		this.statusEl.createEl('p', { text: error, cls: 'error-message' });
		this.statusEl.createEl('p', { 
			text: '設定を確認してもう一度お試しください。',
			cls: 'error-note'
		});
		
		const buttonContainer = this.contentEl.querySelector('.auth-buttons') as HTMLElement;
		if (buttonContainer) buttonContainer.hide();
		
		this.logger.error(`Authentication error: ${error}`);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.logger.debug('Authentication modal closed');
	}
}