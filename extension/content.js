(() => {
  const raw = (node) => node?.textContent?.trim() ?? "";

  function sampleText(pre) {
    const rows = [...pre.children].filter((child) => child.tagName === "DIV");
    if (rows.length && rows.length === pre.children.length) {
      return rows.map((row) => row.textContent).join("\n");
    }
    const copy = pre.cloneNode(true);
    for (const br of copy.querySelectorAll("br")) br.replaceWith("\n");
    return copy.textContent.replace(/\r\n?/g, "\n");
  }

  function addImportButton(statement) {
    const title = statement.querySelector(".header .title");
    if (!title) return;

    const control = document.createElement("button");
    control.type = "button";
    control.textContent = "Open in Skill Issues";
    control.style.cssText = "cursor:pointer;padding:.45em .8em;margin:.4em 0;border:1px solid #754aca;border-radius:6px;background:#f6f1ff;color:#4a208c";
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    statement.before(control, status);

    async function importProblem(open) {
      const focused = open === "focus";
      if (focused) {
        control.disabled = true;
        status.textContent = " Opening compiler…";
      }
      try {
        const samples = [...statement.querySelectorAll(".sample-test")].flatMap((block) => {
          const inputs = [...block.querySelectorAll(".input pre")];
          const outputs = [...block.querySelectorAll(".output pre")];
          if (inputs.length !== outputs.length) throw new Error("Could not pair this problem’s sample inputs and outputs.");
          return inputs.map((input, index) => ({ input: sampleText(input), output: sampleText(outputs[index]) }));
        });
        const details = (selector) => {
          const node = statement.querySelector(selector)?.cloneNode(true);
          node?.querySelector(".property-title")?.remove();
          return raw(node);
        };
        const result = await chrome.runtime.sendMessage({
          type: "import-problem",
          open,
          title: raw(title),
          samples,
          timeLimit: details(".time-limit"),
          memoryLimit: details(".memory-limit"),
          interactive: !!statement.querySelector(".interaction")
            || /(?:is an? interactive problem|interactive problem\.)/i.test(raw(statement).slice(0, 3000)),
        });
        if (!result?.ok) throw new Error(result?.error || "Could not import the samples.");
        status.textContent = focused ? " Opened in Skill Issues."
          : samples.length ? " Samples imported automatically." : " Problem imported.";
        return true;
      } catch (error) {
        status.textContent = " " + error.message;
        return false;
      } finally {
        if (focused) control.disabled = false;
      }
    }

    control.addEventListener("click", () => importProblem("focus"));
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      if (message?.type !== "open-compiler") return;
      importProblem("focus").then(respond);
      return true;
    });
    if (!document.hidden) {
      void importProblem("background");
    } else {
      void importProblem(false);
      function importWhenVisible() {
        if (document.hidden) return;
        document.removeEventListener("visibilitychange", importWhenVisible);
        void importProblem("background");
      }
      document.addEventListener("visibilitychange", importWhenVisible);
    }
  }

  function change(field, value) {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function note(element, message) {
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.style.cssText = "padding:.65em 1em;border:1px solid #754aca;border-radius:6px";
    status.textContent = message;
    element.before(status);
  }

  async function prepareForm() {
    const response = await chrome.runtime.sendMessage({ type: "get-submission" });
    const pending = response?.data;
    if (!pending) return;

    const language = document.querySelector('select[name="programTypeId"]');
    const form = language?.form;
    if (!form) {
      const anchor = document.querySelector("#pageContent");
      if (anchor) note(anchor, "Sign in to Codeforces, then open the submission again from Skill Issues.");
      return;
    }

    const field = form.elements.namedItem("submittedProblemCode") || form.elements.namedItem("submittedProblemIndex");
    const file = form.querySelector('input[type="file"][name="sourceFile" i]');
    const textarea = form.querySelector('textarea[name="source"], #sourceCodeTextarea');
    const options = [...language.options].filter((option) => option.value && !option.disabled);
    const python = options.find((option) => /\bPython\s*3\b/i.test(raw(option)))
      || options.find((option) => /\bPyPy\s*3\b/i.test(raw(option)));

    if (!field || field.disabled || (!file && !textarea) || !python) {
      note(form, "Skill Issues could not fill this Codeforces form. Your solution is still in the compiler.");
      return;
    }

    change(field, pending.problem.target);
    if (field.value !== pending.problem.target) {
      note(form, "Codeforces did not list this problem in the submission form. Check your account and contest access.");
      return;
    }
    change(language, python.value);
    if (file && !file.disabled) {
      const transfer = new DataTransfer();
      transfer.items.add(new File([pending.source], "main.py", { type: "text/x-python" }));
      file.files = transfer.files;
      file.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (textarea && !textarea.disabled && textarea.getClientRects().length) {
      change(textarea, pending.source);
    } else {
      note(form, "Skill Issues could not fill the source field. Your solution is still in the compiler.");
      return;
    }
    note(form, "Skill Issues prepared main.py. Review the problem and language, then click Codeforces Submit.");
  }

  const path = location.pathname.replace(/\/$/, "");
  if (/^\/(?:problemset\/problem\/\d+|(?:(?:group\/[A-Za-z0-9]+\/)?contest|gym)\/\d+\/problem)\/[A-Z][A-Z0-9]*$/.test(path)) {
    const statement = document.querySelector(".problem-statement");
    if (statement) addImportButton(statement);
  } else if (/^\/(?:problemset|(?:(?:group\/[A-Za-z0-9]+\/)?contest|gym)\/\d+)\/submit$/.test(path)) {
    prepareForm().catch(() => {});
  }
})();
