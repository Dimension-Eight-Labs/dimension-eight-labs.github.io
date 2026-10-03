(() => {
  const overlay = document.querySelector("[data-vfd-startup]");
  const skip = document.querySelector("[data-vfd-startup-skip]");
  const logoFrame = document.querySelector("main .logo-frame");
  const cursor = document.querySelector(".vfd-startup__cursor");

  // Existing ignition timings, preceded by a first-paint black hold.
  const sequence = [
    { state: "black-hold", duration: 400 },
    { state: "power-pop", duration: 55 },
    { state: "blackout", duration: 950 },
    { state: "heater", duration: 850 },
    { state: "faint-ghost", duration: 500 },
    { state: "strike-1", duration: 75 },
    { state: "blackout", duration: 480 },
    { state: "partial", duration: 260 },
    { state: "short-dropout", duration: 180 },
    { state: "strike-2", duration: 65 },
    { state: "short-dropout", duration: 90 },
    { state: "partial-2", duration: 110 },
    { state: "short-dropout", duration: 55 },
    { state: "ignite", duration: 220 },
    { state: "flutter", duration: 90 },
    { state: "stable", duration: 400 }
  ];

  const cursorLeadIn = [
    { visible: true, delay: 260 },
    { visible: false, delay: 210 },
    { visible: true, delay: 240 },
    { visible: false, delay: 190 },
    { visible: true, delay: 275 },
    { visible: false, delay: 205 },
    { visible: true, delay: 250 },
    { visible: false, delay: 180 }
  ];

  // Frame-relative reveal edges, tuned to the glyph boundaries in the source PNG.
  const typingSteps = [
    { reveal: 30.2, delay: 145 }, // D
    { reveal: 33.1, delay: 105 }, // I
    { reveal: 40.1, delay: 190 }, // M
    { reveal: 47.0, delay: 310 }, // 8 and word space
    { reveal: 57.0, delay: 125 }, // L
    { reveal: 63.0, delay: 175 }, // A
    { reveal: 69.3, delay: 115 }, // B
    { reveal: 75.2, delay: 160 }  // S
  ];

  const cursorTail = [
    { visible: false, delay: 310 },
    { visible: true, delay: 430 },
    { visible: false, delay: 280 },
    { visible: true, delay: 390 },
    { visible: false, delay: 340 },
    { visible: true, delay: 460 },
    { visible: false, delay: 295 },
    { visible: true, delay: 410 },
    { visible: false, delay: 360 },
    { visible: true, delay: 445 },
    { visible: false, delay: 320 },
    { visible: true, delay: 400 }
  ];

  const shutdownSequence = [
    { state: "completed-hold", duration: 700 },
    { state: "collapse-line", duration: 135 },
    { state: "collapse-dot", duration: 105 },
    { state: "dot-hold", duration: 170 },
    { state: "dot-out", duration: 90 },
    { state: "shutdown-black", duration: 900 }
  ];
  const overlayFadeDuration = 950;

  if (!overlay) {
    console.error("DIM8 startup: overlay element was not found.");
    return;
  }

  if (!logoFrame) {
    console.error("DIM8 startup: homepage logo frame was not found.");
    return;
  }

  let timer = null;
  let step = 0;
  let currentState = "";
  let phaseStep = 0;
  let shutdownStep = 0;

  const alignDisplay = () => {
    const bounds = logoFrame.getBoundingClientRect();

    overlay.style.setProperty("--startup-logo-top", `${bounds.top}px`);
    overlay.style.setProperty("--startup-logo-left", `${bounds.left}px`);
    overlay.style.setProperty("--startup-logo-width", `${bounds.width}px`);
    overlay.style.setProperty("--startup-logo-height", `${bounds.height}px`);
    overlay.style.setProperty("--startup-logo-fallback", "none");
  };

  const clearCurrentState = () => {
    if (!currentState) {
      return;
    }

    overlay.classList.remove(`state-${currentState}`);
  };

  const setState = (state) => {
    clearCurrentState();

    currentState = state;
    overlay.classList.add(`state-${state}`);
  };

  const setCursor = (visible) => {
    cursor.classList.toggle("is-visible", visible);
  };

  const setRevealEdge = (reveal) => {
    overlay.style.setProperty("--text-reveal-edge", `${reveal}%`);
    overlay.style.setProperty("--cursor-edge", `${reveal}%`);
  };

  const resetTextReveal = () => {
    overlay.style.setProperty("--text-reveal-edge", "24%");
    overlay.style.setProperty("--cursor-edge", "25%");
  };

  const revealHomepage = (immediate = false) => {
    window.clearTimeout(timer);
    timer = null;
    window.removeEventListener("resize", alignDisplay);
    if (skip) {
      skip.removeEventListener("click", skipIntro);
      skip.blur();
    }

    if (immediate) {
      overlay.hidden = true;
      overlay.className = "vfd-startup";
      return;
    }

    overlay.classList.add("is-finishing");
    timer = window.setTimeout(() => {
      timer = null;
      overlay.hidden = true;
      overlay.className = "vfd-startup";
    }, overlayFadeDuration);
  };

  const runShutdown = () => {
    if (shutdownStep >= shutdownSequence.length) {
      revealHomepage();
      return;
    }

    const next = shutdownSequence[shutdownStep++];
    setState(next.state);
    timer = window.setTimeout(runShutdown, next.duration);
  };

  const finishTyping = () => {
    shutdownStep = 0;
    setCursor(true);
    runShutdown();
  };

  const runCursorTail = () => {
    if (phaseStep >= cursorTail.length) {
      finishTyping();
      return;
    }

    const next = cursorTail[phaseStep++];
    setCursor(next.visible);
    timer = window.setTimeout(runCursorTail, next.delay);
  };

  const typeNextCharacter = () => {
    if (phaseStep >= typingSteps.length) {
      phaseStep = 0;
      setState("cursor-tail");
      runCursorTail();
      return;
    }

    const next = typingSteps[phaseStep++];
    setRevealEdge(next.reveal);
    timer = window.setTimeout(typeNextCharacter, next.delay);
  };

  const runCursorLeadIn = () => {
    if (phaseStep >= cursorLeadIn.length) {
      phaseStep = 0;
      setState("typing");
      setCursor(true);
      typeNextCharacter();
      return;
    }

    const next = cursorLeadIn[phaseStep++];
    setCursor(next.visible);
    timer = window.setTimeout(runCursorLeadIn, next.delay);
  };

  const startTextReveal = () => {
    phaseStep = 0;
    setState("cursor-lead-in");
    overlay.classList.add("is-text-phase");
    resetTextReveal();
    runCursorLeadIn();
  };

  function skipIntro(event) {
    event.preventDefault();
    revealHomepage(true);
    window.location.assign(skip.href);
  }

  const advance = () => {
    if (step >= sequence.length) {
      startTextReveal();
      return;
    }

    const next = sequence[step];
    step += 1;

    setState(next.state);

    timer = window.setTimeout(advance, next.duration);
  };

  alignDisplay();
  resetTextReveal();

  window.addEventListener("resize", alignDisplay);

  if (skip) {
    skip.addEventListener("click", skipIntro);
  }

  overlay.hidden = false;
  overlay.classList.remove("is-finishing");
  overlay.classList.add("is-active");
  document.documentElement.classList.remove("vfd-intro-pending");
  window.clearTimeout(window.dim8IntroFallbackTimer);
  delete window.dim8IntroFallbackTimer;

  advance();
})();
