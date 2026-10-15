(() => {
  // Resolve from this shared script so the header also works on future nested pages.
  const siteRoot = new URL("../", document.currentScript.src);

  class Dim8Header extends HTMLElement {
    connectedCallback() {
      const currentPage = this.getAttribute("current-page");
      const portfolioUrl = new URL("portfolio/", siteRoot).href;
      const appsUrl = new URL("apps/", siteRoot).href;
      const examplesUrl = new URL("website-examples/", siteRoot).href;
      const logoUrl = new URL("images/dim8-vfd-logo.png", siteRoot).href;

      this.innerHTML = `
        <header class="site-header">
          <div class="site-header__inner">
            <a class="site-brand" href="${portfolioUrl}" aria-label="Dimension 8 Labs — Portfolio">
              <span class="site-brand__mark" aria-hidden="true">
                <img src="${logoUrl}" alt="" width="1280" height="1280">
              </span>
              <span class="site-brand__text">DIMENSION 8 LABS</span>
            </a>
            <nav class="site-nav" aria-label="Primary">
              <a class="dim8-link" href="${portfolioUrl}"${currentPage === "portfolio" ? ' aria-current="page"' : ""}>Portfolio →</a>
              <a class="dim8-link" href="${appsUrl}"${currentPage === "apps" ? ' aria-current="page"' : ""}>Apps →</a>
              <a class="dim8-link" href="${examplesUrl}"${currentPage === "website-examples" ? ' aria-current="page"' : ""}>Website Examples →</a>
            </nav>
          </div>
        </header>`;
    }
  }

  customElements.define("dim8-header", Dim8Header);

  // Keep the retired AAC Time Bridge placeholder URL pointed at its real detail page.
  const projectNumber = new URL(window.location.href).searchParams.get("project");
  if (projectNumber === "2" && window.location.pathname.includes("/portfolio/projects/placeholder/")) {
    window.location.replace("/portfolio/projects/aac-time-bridge/");
    return;
  }

  // TEMPORARY: One shared destination for the remaining layout-testing entries.
  const placeholderTitle = document.querySelector("[data-placeholder-title]");
  if (placeholderTitle) {
    if (["3", "4"].includes(projectNumber)) {
      placeholderTitle.textContent = `Placeholder Project ${projectNumber}`;
      document.title = `Placeholder Project ${projectNumber} — Dimension Eight Labs`;
    }
  }

  const dialog = document.querySelector("#contact-dialog");
  const openButton = document.querySelector("[data-contact-open]");
  if (!dialog || !openButton) return;

  const form = dialog.querySelector("[data-contact-form]");
  const status = dialog.querySelector("#contact-status");
  const submitButton = form.querySelector(".form-submit");
  const turnstileMount = dialog.querySelector("#contact-turnstile");
  const localHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const contactEndpoint = localHost
    ? `http://${window.location.hostname}:8787/submit`
    : "https://dim8-contact.rhaag71.workers.dev/submit";
  let turnstileLoad;
  let turnstileWidgetId;
  let preparingTurnstile = false;
  let sending = false;

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileLoad) return turnstileLoad;

    turnstileLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.addEventListener("load", () => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error("Turnstile did not initialize."));
      }, { once: true });
      script.addEventListener("error", () => {
        turnstileLoad = null;
        reject(new Error("Turnstile failed to load."));
      }, { once: true });
      document.head.append(script);
    });

    return turnstileLoad;
  }

  async function prepareTurnstile() {
    if (turnstileWidgetId !== undefined || preparingTurnstile) return;
    preparingTurnstile = true;
    status.textContent = "Loading the security check…";
    try {
      const turnstile = await loadTurnstile();
      turnstileWidgetId = turnstile.render(turnstileMount, {
        sitekey: turnstileMount.dataset.sitekey,
        theme: "dark",
      });
      status.textContent = "Complete the security check to send your message.";
    } catch {
      turnstileLoad = null;
      turnstileWidgetId = undefined;
      status.textContent = "The security check couldn’t load. Please close and reopen the form to try again.";
    } finally {
      preparingTurnstile = false;
    }
  }

  openButton.addEventListener("click", () => {
    dialog.showModal();
    if (turnstileWidgetId === undefined) {
      void prepareTurnstile();
    } else {
      window.turnstile.reset(turnstileWidgetId);
      status.textContent = "Complete the security check to send your message.";
    }
  });
  dialog.querySelector("[data-contact-close]").addEventListener("click", () => dialog.close());
  // Native dialog provides Escape handling and an inert background.
  // Keep Tab within the form even at the browser's first/last focus boundary.
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)")];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  dialog.addEventListener("close", () => {
    if (window.turnstile && turnstileWidgetId !== undefined) {
      window.turnstile.reset(turnstileWidgetId);
    }
    openButton.focus();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;

    if (turnstileWidgetId === undefined || !window.turnstile) {
      status.textContent = "The security check isn’t ready yet. Please try again in a moment.";
      return;
    }

    const token = window.turnstile.getResponse(turnstileWidgetId);
    if (!token) {
      status.textContent = "Complete the security check before sending.";
      return;
    }

    const fields = new FormData(form);
    const payload = {
      name: fields.get("name"),
      email: fields.get("email"),
      subject: fields.get("subject"),
      message: fields.get("message"),
      website: fields.get("website"),
      turnstileToken: token,
    };

    sending = true;
    submitButton.disabled = true;
    status.textContent = "Sending your message…";
    try {
      const response = await fetch(contactEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error("Submission failed.");

      form.reset();
      status.textContent = "Thanks—your message has been sent.";
    } catch {
      status.textContent = "Sorry, your message couldn’t be sent. Please try again.";
    } finally {
      if (window.turnstile && turnstileWidgetId !== undefined) {
        window.turnstile.reset(turnstileWidgetId);
      }
      submitButton.disabled = false;
      sending = false;
    }
  });
})();
