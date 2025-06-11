# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Type
This is an Obsidian plugin built with TypeScript. The plugin demonstrates core Obsidian API functionality including ribbon icons, commands, modals, settings tabs, and event handling.

## Development Commands
- `npm run dev` - Start development mode with hot reload and watch compilation
- `npm run build` - Type check and build for production
- `npm version patch|minor|major` - Bump version in manifest.json, package.json, and versions.json

## Architecture Overview
- **Entry Point**: `main.ts` contains the main plugin class extending Obsidian's Plugin base class
- **Build System**: Uses esbuild for bundling with external Obsidian API dependencies
- **Plugin Structure**: Single-file plugin with MyPlugin class, SampleModal, and SampleSettingTab
- **Settings**: Simple settings interface with persistent storage via Obsidian's loadData/saveData
- **Manifest**: Plugin metadata in `manifest.json` including version, description, and minimum Obsidian version

## Key Files
- `main.ts` - Main plugin implementation
- `manifest.json` - Plugin metadata and configuration
- `esbuild.config.mjs` - Build configuration with development/production modes
- `versions.json` - Version compatibility mapping
- `version-bump.mjs` - Automated version management script

## Development Notes
- Plugin uses Obsidian API externals (not bundled)
- Development mode includes inline source maps
- Production builds are minified without source maps
- TypeScript strict null checks enabled
- Plugin installs to `.obsidian/plugins/your-plugin-name/` in vault