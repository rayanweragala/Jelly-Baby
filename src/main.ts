import './style.css';
import { hopMarkup } from './game/hop-ui.ts';
import { diagnostic, mountDiagnostics, showDiagnostics } from './game/diagnostics.ts';
import { nativeDiagnostics } from './game/android.ts';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = hopMarkup;
// Diagnostics mount before startup so an early GPU failure still has somewhere to report.
mountDiagnostics();
nativeDiagnostics();
document
  .querySelector('.loading-card')!
  .insertAdjacentHTML('beforeend', '<button id="boot-diagnostics">Diagnostics</button>');
for (const id of ['boot-diagnostics', 'open-diagnostics'])
  document.querySelector(`#${id}`)!.addEventListener('click', () => showDiagnostics());

let stage = 'Loading the game',
  failed = false,
  game: { stop: () => void } | undefined;
function fail(reason: unknown) {
  if (failed) return;
  failed = true;
  game?.stop();
  const error = reason instanceof Error ? reason : new Error(String(reason));
  diagnostic('Failure', `${stage}: ${error.message}`);
  const loading = document.querySelector('#loading')!;
  loading.classList.remove('hidden');
  loading.classList.add('failed');
  document.querySelector('#loading h2')!.textContent = 'A little hiccup.';
  document.querySelector('#load-message')!.textContent = 'The game couldn’t start. Details below.';
  const fatal = document.querySelector<HTMLPreElement>('#fatal')!;
  fatal.hidden = false;
  fatal.textContent = `${stage}\n${error.message}\n\nViewport: ${innerWidth} × ${innerHeight} · DPR ${devicePixelRatio}\n${navigator.userAgent}`;
  document.querySelector<HTMLButtonElement>('#retry')!.hidden = false;
  console.error(`[Jelly Hop / ${stage}]`, error);
}
window.addEventListener('error', (event) => fail(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => fail(event.reason));
document.querySelector('#retry')!.addEventListener('click', () => location.reload());

// One observed chain covers imports, initialization, compilation, warmup and first render.
void import('./game/runtime.ts')
  .then(({ startGame }) =>
    startGame(
      (message) => {
        if (failed) throw new Error('Startup aborted after a GPU failure');
        stage = message;
        diagnostic('Stage', message);
        document.querySelector('#load-message')!.textContent = message;
      },
      fail,
      (stop) => {
        game = { stop };
      },
    ),
  )
  .then((started) => {
    game = started;
    if (failed) {
      game.stop();
      return;
    }
    stage = 'Playing';
    document.querySelector('#loading')!.classList.add('hidden');
  })
  .catch(fail);
