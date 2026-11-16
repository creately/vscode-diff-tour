# Diff Tour for VS Code

**Flow-ordered change walkthroughs, architectural context, and intent capture for AI coding agents in VS Code.**

The Diff Tour extension brings narrative-driven change comprehension and system architecture directly into VS Code. It is completely self-contained: it bundles the Diff Tour runtime, the `@creately/rdm-codebase` scanner, the interactive review viewer webview, and agent skills.

Developers do **not** need `creately-ai`, `rdm`, Bun, or Node checkouts to use it. Git and a supported coding agent (Google Antigravity, Claude Code, or OpenAI Codex) are all that is required for change capture; Creately is an optional cloud workspace used only for system scan handoff and live enterprise architecture records.

---

## Download & Installation

### Option 1: Install the Pre-built VSIX (Recommended)

1. Download the latest `.vsix` file for your platform from the [**Releases**](https://github.com/creately/vscode-diff-tour/releases) page.
2. Install it in VS Code via terminal:
   ```bash
   code --install-extension vscode-diff-tour-0.1.0-macos-arm64.vsix --force
   ```
   *Or inside VS Code:*
   - Open the Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Windows/Linux).
   - Choose **Extensions: Install from VSIX...** and select the downloaded file.

---

## Quick Start Guide

1. **Open Your Git Project in VS Code**:
   Select the **Diff Tour** icon in the Activity Bar.
2. **Propose System Map**:
   In the Project tree or Actions menu, click **Propose System Map** (`diffTour.setupMap`). The bundled scanner analyzes your project's runtimes, entrypoints, and import graphs to create `.creately/system/system.rdm`.
3. **Register Agent Hooks**:
   Click **Add Antigravity**, **Add Claude**, or **Add Codex** to configure prompt submit and completion hooks.
4. **Develop with Your AI Agent**:
   As your agent executes prompts, Diff Tour automatically:
   - Takes zero-commit working tree snapshots.
   - Logs user intent, prompts, and corrections to the local intent ledger (`<git-dir>/creately/changes/<branch>/ledger.jsonl`).
   - Refreshes per-turn semantic diagrams (Database ERD, UML Class, Route maps, and Sequences).
5. **Inspect the Change Review**:
   Click **Open Local Review** (`diffTour.openReview`) in the Diff Tour title bar to open the full interactive 3-column review viewer inside VS Code.
6. **(Optional) Sync Architecture to Creately**:
   Click **Scan repository** and **Send scan to Creately** to export your live codebase architecture into a Creately System Design folder.

---

## Key Capabilities

- **Narrative Claims & Acts**: Groups changes into logical narrative acts rather than raw, unordered file diffs.
- **Verdict Badges**: Surfaces whether agent changes are on-intent (`on_intent`), unexpected (`surprise`), concerning (`concern`), or drifting (`drift`).
- **4-Level Semantic Zooming**:
  - **Forest**: Enterprise-wide system architecture.
  - **Grove**: Container and service boundaries.
  - **Tree**: Component files and attribution.
  - **Leaf**: Side-by-side syntax-highlighted code diff.
- **Sibling Risk Detection**: Identifies unchanged caller files and sibling functions that likely needed matching updates when APIs or signatures changed.
- **Turn Trajectory & History**: Replays prompt-by-prompt evolution across multi-agent sessions and manual developer edits.
- **Turn Diagrams**: Switches on-the-fly between the base system map and semantic views (Database, Class, Sequences).

---

## Building from Source

Build the extension on the operating system and architecture where it will be used (the bundled binary is platform-specific):

### Prerequisites
- [Bun](https://bun.sh) (>= 1.0.0)
- Node.js (>= 18)
- Local checkouts of `creately-ai` and `rdm`

### Build Command
```bash
# Clone the repository
git clone https://github.com/creately/vscode-diff-tour.git
cd vscode-diff-tour

# Package the VSIX (picks up sibling creately-ai and rdm repositories)
bun run package:vsix
```

If `rdm` is located elsewhere, point to it explicitly:
```bash
RDM_REPO="/path/to/rdm" bun run package:vsix
```

Install the newly built `.vsix`:
```bash
code --install-extension vscode-diff-tour-0.1.0-<platform>-<architecture>.vsix --force
```

---

## Local Development & Debugging

1. Open `vscode-diff-tour` in VS Code.
2. Run `node scripts/build-runtime.mjs` to stage the local runtime.
3. Press `F5` (**Run and Debug > Run Diff Tour**).
4. An Extension Development Host opens with the active workspace to test live.

---

## License

[MIT](LICENSE) © [Creately](https://creately.com)
