// Obsidian APIのモック実装

export class Plugin {
  app: any;
  manifest: any;
  
  constructor() {
    this.app = {
      vault: {
        getFiles: jest.fn(() => []),
        read: jest.fn(() => Promise.resolve('')),
        modify: jest.fn(() => Promise.resolve()),
        getAbstractFileByPath: jest.fn(),
        createFolder: jest.fn(() => Promise.resolve()),
        create: jest.fn(() => Promise.resolve({ path: 'test.md' })),
        adapter: {
          exists: jest.fn(() => Promise.resolve(false))
        }
      },
      workspace: {
        on: jest.fn(),
        off: jest.fn(),
      }
    };
  }
  
  loadData() { return Promise.resolve({}); }
  saveData() { return Promise.resolve(); }
  addCommand() { return {}; }
  addRibbonIcon() { return {}; }
  addSettingTab() { return {}; }
}

export class Notice {
  constructor(message: string) {
    // モックではメッセージを記録するだけ
  }
}

export class Modal {
  app: any;
  contentEl: any = { 
    empty: jest.fn(), 
    createEl: jest.fn(() => ({ createEl: jest.fn(), createDiv: jest.fn() })), 
    createDiv: jest.fn(() => ({ createEl: jest.fn(), createDiv: jest.fn(), hide: jest.fn(), show: jest.fn() }))
  };
  
  constructor(app: any) {
    this.app = app;
  }
  
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl: any = { 
    empty: jest.fn(), 
    createEl: jest.fn(() => ({ createEl: jest.fn(), createDiv: jest.fn() })),
    createDiv: jest.fn(() => ({ createEl: jest.fn(), createDiv: jest.fn() }))
  };
  
  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
  }
  
  display() {}
}

export class Setting {
  constructor(containerEl: any) {}
  
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addButton() { return this; }
}

export class ButtonComponent {
  constructor(containerEl?: any) {}
  
  setButtonText() { return this; }
  onClick() { return this; }
  setClass() { return this; }
}

// その他必要なエクスポート
export const Component = class {};
export const TFile = class {
  path: string = '';
  constructor(path?: string) {
    if (path) this.path = path;
  }
};
export const Vault = class {};

// momentのモック
export const moment = jest.fn().mockImplementation((date?: any) => ({
  format: jest.fn().mockReturnValue('2023-01-01')
}));