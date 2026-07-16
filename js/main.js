(() => {
  const SHOW_STARTUP_DEBUG_STATE = true;

  const overlay = document.querySelector("[data-vfd-startup]");
  const skip = document.querySelector("[data-vfd-startup-skip]");
  const debugState = document.querySelector("[data-vfd-startup-debug]");
  const logoFrame = document.querySelector("main .logo-frame");

  /*
   * Deliberately long development timings.
   *
   * Each state remains visible for five seconds so the visual layers can be
   * inspected individually. The final stable state remains indefinitely.
   *
   * Once the visual behavior is correct, shorten these durations and restore
   * the normal completion, reduced-motion, and session behavior.
   */

const sequence = [
  // Power is applied: one abrupt transient, then complete failure.
  { state: "power-pop",       duration: 55 },
  { state: "blackout",        duration: 950 },

  // The display slowly begins showing signs of life.
  { state: "heater",          duration: 850 },
  { state: "faint-ghost",     duration: 500 },

  // First failed ignition.
  { state: "strike-1",        duration: 75 },
  { state: "blackout",        duration: 480 },

  // Weak, uneven attempt.
  { state: "partial",         duration: 260 },
  { state: "short-dropout",   duration: 180 },

  // Two quick, irregular flickers.
  { state: "strike-2",        duration: 65 },
  { state: "short-dropout",   duration: 90 },
  { state: "partial-2",       duration: 110 },
  { state: "short-dropout",   duration: 55 },

  // Existing successful startup ending.
  { state: "ignite",          duration: 220 },
  { state: "flutter",         duration: 90 },
  { state: "stable",          duration: 400 }
];
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

  const alignDisplay = () => {
    const bounds = logoFrame.getBoundingClientRect();

    overlay.style.setProperty("--startup-logo-top", `${bounds.top}px`);
    overlay.style.setProperty("--startup-logo-left", `${bounds.left}px`);
    overlay.style.setProperty("--startup-logo-width", `${bounds.width}px`);
    overlay.style.setProperty("--startup-logo-height", `${bounds.height}px`);
    overlay.style.setProperty("--startup-logo-fallback", "none");
  };

  const showDebugState = (state) => {
    if (!SHOW_STARTUP_DEBUG_STATE || !debugState) {
      return;
    }

    debugState.hidden = false;
    debugState.textContent = state;
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

    showDebugState(state);
    console.log(`DIM8 startup state: ${state}`);
  };

  const stopSequence = () => {
    window.clearTimeout(timer);
    timer = null;

    setState("stable");

    console.log("DIM8 startup sequence stopped manually.");
  };

  const advance = () => {
    if (step >= sequence.length) {
      console.log(
        "DIM8 startup sequence reached the final stable state and will remain visible."
      );
      return;
    }

    const next = sequence[step];
    step += 1;

    setState(next.state);

    /*
     * Do not schedule another step after the final stable state.
     * This leaves the overlay visible indefinitely for inspection.
     */
    if (step >= sequence.length) {
      console.log(
        "DIM8 startup sequence reached the final stable state and will remain visible."
      );
      return;
    }

    timer = window.setTimeout(advance, next.duration);
  };

  alignDisplay();

  window.addEventListener("resize", alignDisplay);

  /*
   * During development, Skip does not hide the startup overlay.
   * It simply stops the sequence and switches directly to the stable state.
   */
  if (skip) {
    skip.addEventListener("click", stopSequence);
  }

  overlay.hidden = false;
  overlay.classList.remove("is-finishing");
  overlay.classList.add("is-active");

  console.log("DIM8 startup development sequence starting.");
  console.log("Each state lasts five seconds.");
  console.log("The final stable state remains visible indefinitely.");

  advance();
})();