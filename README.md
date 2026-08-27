# Git Atlas

A fast, keyboard-first visual Git branch explorer designed for Codex workflows.

## What it does

- Visualizes branches and commits in a dense, readable timeline
- Filters by branch and searches by message, author, hash, or branch
- Shows a focused commit inspector with change summaries
- Imports real history from any repository using a read-only `git log` command
- Copies ready-to-use Codex prompts for commit explanation and inspection
- Supports arrow-key navigation and `Ctrl/Cmd + K` search

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Import a repository

Choose **Open repository** in Git Atlas. Run the command shown there inside the Git repository you want to explore, then paste its output into the importer. Parsing happens locally in your browser.

## Production build

```bash
npm run build
npm start
```

## License

MIT
