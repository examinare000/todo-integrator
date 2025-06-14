// テスト環境のセットアップ
export {};

global.console = {
  ...console,
  // テスト中の不要なログを抑制
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: console.warn,
  error: console.error,
};