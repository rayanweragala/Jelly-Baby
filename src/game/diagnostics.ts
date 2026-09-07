/** GPU completion is not proof of visible pixels. Keep both claims separate. */
const entries = new Map<string, string>([
  ['App', 'Jelly Hop 0.1.0'],
  [
    'Platform',
    /Android/.test(navigator.userAgent)
      ? 'Android browser (native identity pending)'
      : 'Desktop browser',
  ],
  ['User agent', navigator.userAgent],
  ['Secure context', String(window.isSecureContext)],
  ['WebGPU exposed', String(!!navigator.gpu)],
  ['Adapter', 'Not requested'],
  ['Device', 'Not initialized'],
  ['First frame', 'Not submitted'],
]);

export function diagnostic(key: string, value: unknown) {
  entries.set(key, String(value));
  console.info(`[Jelly Hop] ${key}: ${value}`);
  refresh();
}

function refresh() {
  const output = document.querySelector<HTMLTextAreaElement>('#diagnostic-text');
  if (output)
    output.value = [
      ...entries,
      ['Viewport', `${innerWidth} × ${innerHeight}; DPR ${devicePixelRatio}`],
    ]
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
}

export function mountDiagnostics() {
  document.querySelector('#app')!.insertAdjacentHTML(
    'beforeend',
    `
    <dialog id="diagnostics" aria-labelledby="diagnostic-title">
      <h2 id="diagnostic-title">Device diagnostics</h2>
      <p>GPU completion confirms submitted work. Confirm the jelly is visible on your phone.</p>
      <textarea id="diagnostic-text" readonly aria-label="Diagnostic text" rows="13"></textarea>
      <p id="copy-status" role="status"></p>
      <button id="copy-diagnostics">Copy text</button><button id="close-diagnostics">Close</button>
    </dialog>`,
  );
  const dialog = document.querySelector<HTMLDialogElement>('#diagnostics')!;
  document.querySelector('#close-diagnostics')!.addEventListener('click', () => dialog.close());
  document.querySelector('#copy-diagnostics')!.addEventListener('click', () => {
    const output = document.querySelector<HTMLTextAreaElement>('#diagnostic-text')!;
    output.select();
    document.querySelector('#copy-status')!.textContent = 'Text selected. Long-press to copy.';
    void navigator.clipboard
      ?.writeText(output.value)
      .then(() => {
        document.querySelector('#copy-status')!.textContent = 'Copied';
      })
      .catch(() => {});
  });
  refresh();
}

export function showDiagnostics() {
  refresh();
  const dialog = document.querySelector<HTMLDialogElement>('#diagnostics')!;
  if (!dialog.open) dialog.showModal();
}
