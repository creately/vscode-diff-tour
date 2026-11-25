# Diff Tour for VS Code

Diff Tour captures AI coding-agent prompts and presents each completed code-changing turn as a local review with file diffs and applicable database, class, dependency, API, and sequence views.

## Download

Download a prebuilt VSIX from the [latest GitHub Release](https://github.com/creately/vscode-diff-tour/releases/latest).

Available build:

- macOS Apple Silicon: `vscode-diff-tour-0.1.3-macos-arm64.vsix`

Release assets are platform-specific because the extension contains a native Diff Tour executable. Do not install an asset built for another operating system or architecture.

## Install

In VS Code:

1. Open the Command Palette.
2. Select **Extensions: Install from VSIX...**.
3. Choose the downloaded file.
4. Reload VS Code when prompted.

Or use the command line:

```bash
code --install-extension /path/to/vscode-diff-tour-0.1.3-macos-arm64.vsix --force
```

## Start

1. Open a Git repository in VS Code.
2. Run **Diff Tour: Open Dashboard in Browser**.
3. Select **Add Codex** and trust the project hooks and configuration in Codex.
4. Start a new Codex chat for the repository.
5. Develop normally. For code-changing tasks, Codex calls Diff Tour before its final response and embeds the generated review in the chat.

The browser dashboard remains available for setup, manual review refresh, and optional Creately System Design handoff.

The extension defaults Creately System Design handoff to `https://ai.creately.com`. Change `diffTour.createlyUrl` in VS Code settings only when testing another Creately host.

## Source and releases

This repository is the public binary distribution surface. Extension source, tests, runtime source, and build scripts are maintained in Creately's private `creately-ai` repository. Creately maintainers build each platform artifact there and attach it to a GitHub Release here.

External developers only need the matching VSIX, Git, VS Code, and a supported coding agent. They do not need local `creately-ai`, `rdm`, Bun, or Node checkouts.

## License

[MIT](LICENSE) © [Creately](https://creately.com)
