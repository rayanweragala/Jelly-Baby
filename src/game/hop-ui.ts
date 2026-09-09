import { flavorPickerMarkup } from './flavor-picker.ts';

export const hopMarkup = `
  <main id="viewport" aria-label="Jelly Hop tidepool"></main>
  <div class="dawn" aria-hidden="true"></div>
  <header class="masthead"><span class="eyebrow">A tidepool at dawn</span><h1>Jelly<br>Hop</h1></header>
  <nav class="actions" aria-label="Game controls">
    <button id="home" class="icon-button" aria-label="Open main menu">Menu</button>
    <button id="sound" class="icon-button" aria-label="Mute sound" aria-pressed="false">Sound</button>
    ${flavorPickerMarkup()}
  </nav>
  <section id="home-panel" class="menu-panel" aria-labelledby="home-title">
    <h2 id="home-title" class="sr-only">A tidepool at dawn</h2>
    <button id="play" class="primary">Keep hopping <span id="play-level">LV 1</span></button>
    <div class="menu-row"><button id="levels">Stones</button><button id="skins">Skins</button></div>
    <button id="free-play" class="wide-button">Free play <span aria-hidden="true">↗</span></button>
    <p id="home-progress" class="menu-caption">Five little stones. Take your time.</p>
    <div class="home-options"><button id="motion" class="text-button" aria-pressed="false">Reduce motion</button><button id="open-diagnostics" class="text-button">Device diagnostics</button></div>
  </section>
  <section id="levels-panel" class="menu-panel" aria-labelledby="levels-title" hidden>
    <span class="eyebrow">Find your next landing</span><h2 id="levels-title">The Shallows</h2>
    <p id="level-summary"></p><div id="level-list"></div><button id="levels-back">Back to shore</button>
  </section>
  <section id="hud" aria-label="Level progress" hidden>
    <div class="hud-pill"><span id="level-number">LV 1</span><span class="hud-divider" aria-hidden="true"></span><span id="throw-count" aria-live="polite">0 throws</span><span id="throw-par">/ 1</span></div><span id="level-name"></span>
  </section>
  <span id="target-label" hidden>LAND HERE</span>
  <dialog id="pause-menu" aria-labelledby="pause-title"><span class="eyebrow">Take your time</span><h2 id="pause-title">A little breather</h2><button id="resume" class="primary">Keep hopping</button><button id="pause-home">Back to shore</button></dialog>
  <div id="power-ring" aria-hidden="true" hidden></div>
  <div id="recovery-ripple" aria-hidden="true" hidden></div>
  <div id="stretch-cue" aria-hidden="true" hidden><svg viewBox="0 0 100 100" preserveAspectRatio="none">
    <defs><marker id="stretch-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L9 5L1 9" /></marker></defs>
    <line id="stretch-line" marker-end="url(#stretch-head)" vector-effect="non-scaling-stroke" />
  </svg>${Array.from({ length: 6 }, (_, i) => `<span id="stretch-bead-${i}" class="stretch-bead"></span>`).join('')}</div>
  <div id="shot-feedback" hidden>
    <span id="shot-status" role="status"></span>
    <progress id="settle-progress" max="0.6" value="0" aria-label="Landing settled" hidden></progress>
  </div>
  <section id="completion" class="menu-panel" aria-labelledby="complete-title" hidden>
    <span id="complete-eyebrow" class="eyebrow">Stone cleared</span><h2 id="complete-title">Barely a ripple</h2>
    <dl class="result-metrics"><div><dt>Position</dt><dd id="result-position">100%</dd><span>on the stone</span></div><div><dt>Landing</dt><dd id="result-landing">Soft</dd><span>take it easy</span></div><div><dt>Throws</dt><dd id="result-throws">1</dd><span id="result-par">par 1</span></div></dl>
    <p id="medal" class="medal" aria-live="polite"></p>
    <p id="result"></p><button id="next" class="primary">Next stone ↗</button>
    <div class="menu-row"><button id="retry-level">Replay</button><button id="complete-levels">Stones</button></div>
  </section>
  <footer id="play-footer" hidden><p id="play-hint" role="status"></p><button id="reset">Reset stone <span aria-hidden="true">↺</span></button></footer>
  <p id="notice" role="status" aria-live="polite"></p>
  <div class="touch-controls" aria-label="Free play touch controls" hidden>
    <button class="joystick" data-joystick type="button" aria-label="Move"><span class="joystick-track" aria-hidden="true"></span><span class="joystick-knob" aria-hidden="true"></span></button>
    <button class="jump" data-control="Space" aria-label="Hop">↑<span>hop</span></button>
  </div>
  <section id="loading" role="status" aria-live="polite"><div class="loading-card"><div class="jelly-mark"></div><span class="eyebrow">A tidepool at dawn</span><h2>Jelly Hop</h2><p id="load-message">Waiting for the tide</p><pre id="fatal" hidden></pre><button id="retry" hidden>Try again</button></div></section>
`;
