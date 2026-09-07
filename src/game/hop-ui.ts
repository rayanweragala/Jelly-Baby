import { flavorPickerMarkup } from './flavor-picker.ts';

export const hopMarkup = `
  <main id="viewport" aria-label="Jelly Hop tabletop"></main>
  <header class="masthead"><span class="eyebrow">a pocketful of happy</span><h1>jelly hop<span>.</span></h1></header>
  <nav class="actions" aria-label="Game controls">
    <button id="home" class="icon-button" aria-label="Open main menu">Menu</button>
    <button id="sound" class="icon-button" aria-label="Mute sound" aria-pressed="false">Sound</button>
    ${flavorPickerMarkup()}
  </nav>
  <section id="home-panel" class="menu-panel" aria-labelledby="home-title">
    <span class="eyebrow">tiny throws. big wobble.</span><h2 id="home-title">A softer landing.</h2>
    <p>Stretch, let go, and find your spot.</p>
    <button id="play" class="primary">Let's play <span aria-hidden="true">↗</span></button>
    <div class="menu-row"><button id="skins">Skins</button><button id="levels">Levels</button><button id="free-play">Free play</button></div>
    <button id="open-diagnostics" class="text-button">Device diagnostics</button>
  </section>
  <section id="levels-panel" class="menu-panel" aria-labelledby="levels-title" hidden>
    <span class="eyebrow">five little adventures</span><h2 id="levels-title">Pick your spot.</h2>
    <div id="level-list"></div><button id="levels-back">Back</button>
  </section>
  <section id="hud" aria-label="Level progress" hidden>
    <span id="level-name"></span><span id="throw-count" aria-live="polite">0 throws</span>
  </section>
  <section id="completion" class="menu-panel" aria-labelledby="complete-title" hidden>
    <span class="eyebrow">sweet spot!</span><h2 id="complete-title">Stuck the landing.</h2>
    <p id="result"></p><button id="next" class="primary">Next little adventure ↗</button>
    <div class="menu-row"><button id="retry-level">Retry</button><button id="complete-levels">Levels</button></div>
  </section>
  <footer id="play-footer" hidden><p id="play-hint" role="status"></p><button id="reset">Reset jelly</button></footer>
  <p id="notice" role="status" aria-live="polite"></p>
  <div class="touch-controls" aria-label="Free play touch controls" hidden>
    <button class="joystick" data-joystick type="button" aria-label="Move"><span class="joystick-track" aria-hidden="true"></span><span class="joystick-knob" aria-hidden="true"></span></button>
    <button class="jump" data-control="Space" aria-label="Hop">↑<span>hop</span></button>
  </div>
  <section id="loading" role="status" aria-live="polite"><div class="loading-card"><div class="jelly-mark"></div><h2>A little life.</h2><p id="load-message">Warming up the world</p><pre id="fatal" hidden></pre><button id="retry" hidden>Try again</button></div></section>
`;
