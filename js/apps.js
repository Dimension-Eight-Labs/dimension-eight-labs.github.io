(() => {
  // Enhance reusable platform instructions while leaving every panel readable
  // when JavaScript is unavailable.
  document.querySelectorAll("[data-tabset]").forEach((tabset) => {
    const tabs = [...tabset.querySelectorAll("[role='tab'][data-tab]")];
    const panels = [...tabset.querySelectorAll("[role='tabpanel'][data-tab-panel]")];

    if (!tabs.length || !panels.length) return;

    const activateTab = (nextTab, moveFocus = true) => {
      tabs.forEach((tab) => {
        const isActive = tab === nextTab;
        tab.setAttribute("aria-selected", String(isActive));
        tab.tabIndex = isActive ? 0 : -1;
      });

      panels.forEach((panel) => {
        panel.hidden = panel.id !== nextTab.getAttribute("aria-controls");
      });

      if (moveFocus) nextTab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateTab(tab, false));
      tab.addEventListener("keydown", (event) => {
        let nextIndex;

        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          nextIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          nextIndex = (index + 1) % tabs.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = tabs.length - 1;
        } else {
          return;
        }

        event.preventDefault();
        activateTab(tabs[nextIndex]);
      });
    });

    activateTab(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0], false);
  });
})();
