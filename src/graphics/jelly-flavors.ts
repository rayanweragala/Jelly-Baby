export type JellyFlavor = {
  readonly label: string;
  readonly surface: string;
  readonly swatch: string;
  readonly absorption: readonly [number, number, number];
  readonly roughness: number;
  readonly transmission: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly ior: number;
  readonly attenuationDistance: number;
};

export const JELLY_FLAVORS = {
  strawberry: {
    label: 'Strawberry red',
    surface: '#ff7f93',
    swatch: '#ff4d64',
    absorption: [8, 46, 58],
    roughness: 0.075,
    transmission: 1,
    clearcoat: 0.5,
    clearcoatRoughness: 0.045,
    ior: 1.35,
    attenuationDistance: 0.034,
  },
  tangerine: {
    label: 'Tangerine orange',
    surface: '#ffb15c',
    swatch: '#ff8d28',
    absorption: [5, 23, 82],
    roughness: 0.08,
    transmission: 1,
    clearcoat: 0.48,
    clearcoatRoughness: 0.048,
    ior: 1.35,
    attenuationDistance: 0.036,
  },
  lemon: {
    label: 'Lemon yellow',
    surface: '#fff26e',
    swatch: '#ffe94d',
    absorption: [6, 7, 112],
    roughness: 0.082,
    transmission: 1,
    clearcoat: 0.46,
    clearcoatRoughness: 0.052,
    ior: 1.35,
    attenuationDistance: 0.037,
  },
  lime: {
    label: 'Lime green',
    surface: '#cfff7a',
    swatch: '#9bea44',
    absorption: [42, 3, 88],
    roughness: 0.078,
    transmission: 1,
    clearcoat: 0.5,
    clearcoatRoughness: 0.047,
    ior: 1.35,
    attenuationDistance: 0.035,
  },
  aqua: {
    label: 'Aqua blue',
    surface: '#91f0ff',
    swatch: '#53d7f2',
    absorption: [42, 10, 5],
    roughness: 0.07,
    transmission: 1,
    clearcoat: 0.54,
    clearcoatRoughness: 0.04,
    ior: 1.35,
    attenuationDistance: 0.036,
  },
  blueberry: {
    label: 'Blueberry purple',
    surface: '#b49bff',
    swatch: '#775de8',
    absorption: [18, 25, 4],
    roughness: 0.085,
    transmission: 1,
    clearcoat: 0.46,
    clearcoatRoughness: 0.055,
    ior: 1.35,
    attenuationDistance: 0.034,
  },
  bubblegum: {
    label: 'Bubblegum pink',
    surface: '#ffabe0',
    swatch: '#ff76c9',
    absorption: [7, 32, 24],
    roughness: 0.078,
    transmission: 1,
    clearcoat: 0.52,
    clearcoatRoughness: 0.046,
    ior: 1.35,
    attenuationDistance: 0.035,
  },
  pearl: {
    label: 'Milky pearl',
    surface: '#fff4e7',
    swatch: '#f2dfcd',
    absorption: [5, 6, 8],
    roughness: 0.18,
    transmission: 0.82,
    clearcoat: 0.34,
    clearcoatRoughness: 0.09,
    ior: 1.35,
    attenuationDistance: 0.06,
  },
} as const satisfies Record<string, JellyFlavor>;

export type JellyFlavorName = keyof typeof JELLY_FLAVORS;
export const DEFAULT_JELLY_FLAVOR: JellyFlavorName = 'lime';
