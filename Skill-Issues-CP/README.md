# skillissues

**A browser-based runner for Python scripts and competitive programming test cases.** I built the editor, execution controls, and input/output bridge in JavaScript. [Pyodide](https://pyodide.org/en/0.29.3/) supplies the WebAssembly build of CPython that compiles and runs each script.

## How I built it

- **Worker-based execution.** The page loads Pyodide in a standby Web Worker. Pressing Play sends the source to that worker, which writes a virtual `main.py` and runs it with `runpy.run_path()`. It streams stdout and stderr back to the output pane while the editor stays responsive. [Worker implementation](web/python-worker.js)
- **Interactive input and output.** When Python reads input, the Input tab opens and focuses the cursor beside any `input()` prompt. Enter submits a reply, and Ctrl+D sends end of input. The worker waits on `Atomics.wait()`, and the page uses a `SharedArrayBuffer` and `Atomics.notify()` to resume it. When the run ends, the console opens Output to show stdout and stderr. Live input uses the cross-origin isolation headers included for local preview and hosting. [Console and input handling](web/app.js)
- **Stop and reset.** Stop terminates the worker, including when a script is stuck in a loop or waiting for input. A new worker per run gives each script a fresh Python runtime and virtual filesystem. Execution and output limits keep runaway programs from flooding the console. [Run lifecycle](web/app.js)
- **Editor.** The syntax highlighter classifies Python tokens for display. The editor also handles indentation, matching brackets and quotes, and saving code in browser storage. [Syntax highlighter](web/highlight.js)

## Where compilation happens

A compiler translates source into instructions for a target. Here, the target for user scripts is **CPython bytecode**.

1. **Tokenize and parse.** CPython groups source into tokens such as names, operators, and indentation, then parses them into an abstract syntax tree (AST).
2. **Analyze and generate code.** CPython builds a symbol table to determine scope, turns the AST into instructions, optimizes control flow, and assembles bytecode.
3. **Execute.** CPython’s interpreter executes those instructions. A missing colon can raise a `SyntaxError` before execution, while `ZeroDivisionError` occurs when execution reaches a division by zero.

The WebAssembly module is the CPython runtime itself. The Python script you type is compiled to bytecode inside that runtime. [CPython compiler source](https://github.com/python/cpython/blob/main/Python/compile.c)

## Run locally

```sh
python3 server.py
```

Open [localhost:4173](http://127.0.0.1:4173/). If you have the old preview running, stop it with **Ctrl+C** and start it again from this folder.

## Runtime downloads and offline use

Vercel runs `npm run build` to include Pyodide in the static deployment. To include the same files in your local preview or on another static host, run `npm install` and `npm run build` before serving `web/`.

Python starts loading when the editor opens. If the site's copy fails to initialize or stalls, the app tries jsDelivr in a fresh worker. Vercel serves the versioned runtime files with long-lived browser caching. On HTTPS and localhost, a service worker keeps the app and downloaded Python files in the browser's Cache Storage. Run once while connected to set up offline use. An uncached runtime and additional Python packages may need a network connection, and clearing site data removes the offline copy.

## Skill Issues CP browser extension

Skill Issues CP packages this Python editor and its Pyodide runtime in a single Manifest V3 extension for Chrome 116 or later and compatible Chromium browsers. It imports individual Codeforces problems from the problemset, contests, Gym, and groups.

### Install the packaged extension

1. Extract `Skill-Issues-CP.zip`.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the extracted `skill-issues-cp` folder that contains `manifest.json`.

### Use it

1. Open a Codeforces problem. The extension imports the sample inputs and expected outputs and opens [Skill Issues Compiler](https://skillissuescompiler.vercel.app/) in a background tab. Switch to it or click **Open in Skill Issues** above the problem statement to bring it forward.
2. Write your Python solution and click **Run Tests** next to the editor. The Test cases panel shows the imported examples and the result of each run. You can add your own tests with or without an expected output. The extension saves drafts and custom tests by problem in the current browser profile.
3. Click **Prepare submission**. The extension opens the Codeforces submission form, selects a Python language and the imported problem, and attaches your code as `main.py`. Review the form and click **Submit** on Codeforces. If Codeforces asks you to sign in, sign in there and prepare the submission again.

The extension toolbar button opens the current Codeforces problem if one is open, or the most recently imported problem otherwise. The compiler includes a list of previously imported problems. The hosted compiler saves drafts and custom tests in the website’s browser storage.

Local tests compare whitespace-separated output and give each Python process up to five seconds after startup. Interactive judges, special checkers, hidden tests, and Codeforces runtime or memory limits are handled by Codeforces.

### Build from source

```sh
npm install
npm run build:extension
```

Load `dist/skill-issues-cp` as the unpacked extension. Reload it from the extensions page after rebuilding, then refresh any open Codeforces problem pages.

The extension includes [Pyodide v0.29.3](https://github.com/pyodide/pyodide/tree/0.29.3), distributed under the [Mozilla Public License 2.0](https://www.mozilla.org/MPL/2.0/), and the [CPython standard library](https://docs.python.org/3/license.html).
