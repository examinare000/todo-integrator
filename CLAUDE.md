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
- Whole design and implementation plan should be included in `design.md`.

## Git Commit Guidelines
- create an appropriately-named branch for each development and perform development in it.
- development branch is merged into `main` when the development is done.
- ensure to always keep `main` branch clean. all tests should pass in `main` branch.  
- version number should increase when each development branch is merged into `main` branch.
- Use Japanese commit messages (one line)
- Do NOT include "Generated with Claude Code" or "Co-Authored-By: Claude" in commit messages
- Keep commit messages simple and descriptive
- Default branch is `main` (not `master`)

## Claude Code Best Practices

### Task Management Strategy
- **Break Down Large Tasks**: Always decompose complex tasks into small, specific TodoWrite items
- **Step-by-Step Execution**: Complete one todo at a time, updating status as progress is made
- **Minimize Context**: Focus on the immediate task while maintaining awareness of the overall goal
- **Frequent TodoRead**: Use TodoRead proactively to stay aligned with current objectives

### Problem-Solving Approach
1. **Analyze**: Understand the problem and identify root causes
2. **Decompose**: Break into smaller, manageable sub-tasks
3. **Prioritize**: Use high/medium/low priority levels appropriately
4. **Execute**: Implement solutions incrementally
5. **Validate**: Test each step before proceeding
6. **Iterate**: Update todos and continue until completion

### Development Workflow
- Use TodoWrite to plan work before starting implementation
- Mark todos as "in_progress" when actively working
- Mark todos as "completed" immediately upon finishing
- Create new todos when discovering additional work during implementation
- Maintain clean separation between planning and execution phases
