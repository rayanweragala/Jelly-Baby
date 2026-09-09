import {
  DEFAULT_JELLY_FLAVOR,
  JELLY_FLAVORS,
  type JellyFlavorName,
} from '../graphics/jelly-flavors.ts';

const FLAVOR_STORAGE_KEY = 'jelly-baby.flavor';

export function flavorPickerMarkup() {
  const options = Object.entries(JELLY_FLAVORS)
    .map(
      ([name, flavor]) => `
    <button class="flavor-option" type="button" data-flavor="${name}" aria-label="${flavor.label}" aria-pressed="${name === DEFAULT_JELLY_FLAVOR}" style="--flavor-color:${flavor.swatch}">
      <span class="flavor-option-swatch" aria-hidden="true"></span><span>${flavor.label}</span>
    </button>`,
    )
    .join('');
  return `<div id="flavor-picker" class="flavor-picker">
    <button id="flavor" class="icon-button flavor-picker-button" type="button" aria-label="Choose jelly flavor (currently ${JELLY_FLAVORS[DEFAULT_JELLY_FLAVOR].label})" aria-haspopup="true" aria-expanded="false" aria-controls="flavor-menu" title="Jelly flavor: ${JELLY_FLAVORS[DEFAULT_JELLY_FLAVOR].label}">
      <svg class="palette-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 3C6.48 3 2 6.92 2 11.75C2 16.58 6.48 20.5 12 20.5H13.4C14.6 20.5 15.35 19.2 14.75 18.16C14.24 17.28 14.88 16.18 15.9 16.18H17.2C19.85 16.18 22 14.03 22 11.38C22 6.75 17.52 3 12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="7.2" cy="10.2" r="1.25" fill="#FF5A5F"/>
        <circle cx="9.8" cy="6.8" r="1.25" fill="#FFB400"/>
        <circle cx="14.2" cy="6.7" r="1.25" fill="#34C759"/>
        <circle cx="17.2" cy="9.8" r="1.25" fill="#5B8CFF"/>
      </svg>
    </button>
    <div id="flavor-menu" class="flavor-menu" role="group" aria-label="Jelly flavor choices" hidden>
      <h2 class="flavor-heading">Skins</h2><p id="wearing-flavor" aria-live="polite">Wearing ${JELLY_FLAVORS[DEFAULT_JELLY_FLAVOR].label}</p>${options}
      <p class="flavor-caption">Tap a swatch to try it instantly.</p>
      <button id="skins-done" class="flavor-done">Done</button>
    </div>
  </div>`;
}

type FlavorSelectionHandler = (flavor: JellyFlavorName) => void;

function isJellyFlavorName(value: string | undefined): value is JellyFlavorName {
  return value !== undefined && Object.prototype.hasOwnProperty.call(JELLY_FLAVORS, value);
}

export class FlavorPicker {
  private readonly root: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private readonly menu: HTMLDivElement;
  private readonly options: NodeListOf<HTMLButtonElement>;
  private readonly onSelect: FlavorSelectionHandler;
  private readonly abort = new AbortController();

  constructor(onSelect: FlavorSelectionHandler) {
    this.root = document.querySelector<HTMLDivElement>('#flavor-picker')!;
    this.button = this.root.querySelector<HTMLButtonElement>('#flavor')!;
    this.menu = this.root.querySelector<HTMLDivElement>('#flavor-menu')!;
    this.options = this.root.querySelectorAll<HTMLButtonElement>('[data-flavor]');
    this.onSelect = onSelect;
    const { signal } = this.abort;
    this.button.addEventListener('click', this.toggle, { signal });
    this.options.forEach((option) => option.addEventListener('click', this.choose, { signal }));
    document.addEventListener('pointerdown', this.closeWhenOutside, { signal });
    document.addEventListener('keydown', this.handleKeyDown, { signal });
    const flavor = this.restoreFlavor();
    this.setSelected(flavor);
    this.onSelect(flavor);
  }

  private toggle = (event: MouseEvent) => {
    if (this.menu.hidden) this.open(event.detail === 0);
    else this.close();
  };

  get isOpen() {
    return !this.menu.hidden;
  }

  open(focusOption = false) {
    this.menu.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    if (focusOption) this.options[this.selectedIndex()]?.focus({ preventScroll: true });
  }

  close() {
    this.menu.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
  }

  private closeWhenOutside = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node) || !this.root.contains(target)) this.close();
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !this.menu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      this.button.focus({ preventScroll: true });
    }
  };

  private selectedIndex() {
    return [...this.options].findIndex((option) => option.getAttribute('aria-pressed') === 'true');
  }

  private choose = (event: MouseEvent) => {
    const name = (event.currentTarget as HTMLButtonElement).dataset.flavor;
    if (!isJellyFlavorName(name)) return;
    this.setSelected(name);
    this.saveFlavor(name);
    this.onSelect(name);
  };

  private setSelected(name: JellyFlavorName) {
    const label = JELLY_FLAVORS[name].label;
    const wearing = this.root.querySelector('#wearing-flavor');
    if (wearing) wearing.textContent = `Wearing ${label}`;
    this.button.title = `Jelly flavor: ${label}`;
    this.button.setAttribute('aria-label', `Choose jelly flavor (currently ${label})`);
    this.options.forEach((option) =>
      option.setAttribute('aria-pressed', String(option.dataset.flavor === name)),
    );
  }

  private restoreFlavor() {
    try {
      const stored = localStorage.getItem(FLAVOR_STORAGE_KEY) ?? undefined;
      return isJellyFlavorName(stored) ? stored : DEFAULT_JELLY_FLAVOR;
    } catch (error) {
      this.reportStorageError(error);
      return DEFAULT_JELLY_FLAVOR;
    }
  }

  private saveFlavor(name: JellyFlavorName) {
    try {
      localStorage.setItem(FLAVOR_STORAGE_KEY, name);
    } catch (error) {
      this.reportStorageError(error);
    }
  }

  private reportStorageError(error: unknown) {
    window.dispatchEvent(
      new CustomEvent('jelly-storage-error', {
        detail: { message: error instanceof Error ? error.message : String(error) },
      }),
    );
  }

  dispose() {
    this.abort.abort();
    this.close();
  }
}
