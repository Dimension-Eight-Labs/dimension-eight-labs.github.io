(() => {
  // Resolve from this shared script so the header also works on future nested pages.
  const siteRoot = new URL("../", document.currentScript.src);

  class Dim8Header extends HTMLElement {
    connectedCallback() {
      const currentPage = this.getAttribute("current-page");
      const portfolioUrl = new URL("portfolio/", siteRoot).href;
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

  openButton.addEventListener("click", () => dialog.showModal());
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
  dialog.addEventListener("close", () => openButton.focus());
  dialog.querySelector("[data-contact-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    // UI stub only: preserve the form and never claim delivery or make a network request.
    dialog.querySelector("#contact-status").textContent = "Sending is not connected yet. Your message has not been sent.";
  });
})();
