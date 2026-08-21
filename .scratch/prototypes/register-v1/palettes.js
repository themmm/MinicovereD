/* Token contract -> palette mapping. Every hex below is copied from a primary
   source: @catppuccin/palette 1.8.0 (MIT), @rose-pine/palette 4.0.1 (MIT),
   nord 0.2.1 sass/nord.scss (MIT), sainnhe/everforest palette.md (MIT),
   rebelot/kanagawa.nvim lua/kanagawa/colors.lua (MIT),
   tokyo-night/tokyo-night-vscode-theme themes/*.json (MIT). */

export const CONTRACT = [
  'page', 'surface', 'sunken', 'line', 'lineStrong',
  'ink', 'inkSoft', 'inkFaint',
  'accent', 'accentSoft', 'ok', 'okSoft',
  'shell', 'shellInk', 'shellFaint', 'shellLine',
];

export const PALETTES = {
  'catppuccin-mocha': {
    label: 'Catppuccin Mocha', dark: true, family: 'Catppuccin',
    page: '#181825', surface: '#1e1e2e', sunken: '#11111b', line: '#313244', lineStrong: '#7f849c',
    ink: '#cdd6f4', inkSoft: '#a6adc8', inkFaint: '#9399b2',
    accent: '#f9e2af', accentSoft: '#2c2a20', ok: '#a6e3a1', okSoft: '#1e2a20',
    shell: '#11111b', shellInk: '#cdd6f4', shellFaint: '#7f849c', shellLine: '#313244',
  },
  'catppuccin-latte': {
    label: 'Catppuccin Latte', dark: false, family: 'Catppuccin',
    page: '#e6e9ef', surface: '#eff1f5', sunken: '#dce0e8', line: '#ccd0da', lineStrong: '#7c7f93',
    ink: '#4c4f69', inkSoft: '#5c5f77', inkFaint: '#6c6f85',
    accent: '#df8e1d', accentSoft: '#faf0d8', ok: '#40a02b', okSoft: '#e3f1de',
    shell: '#4c4f69', shellInk: '#eff1f5', shellFaint: '#acb0be', shellLine: '#5c5f77',
  },
  'tokyo-night': {
    label: 'Tokyo Night', dark: true, family: 'Tokyo Night',
    page: '#16161e', surface: '#1a1b26', sunken: '#101014', line: '#414868', lineStrong: '#787c99',
    ink: '#c0caf5', inkSoft: '#a9b1d6', inkFaint: '#787c99',
    accent: '#e0af68', accentSoft: '#2a2318', ok: '#9ece6a', okSoft: '#1c2418',
    shell: '#101014', shellInk: '#c0caf5', shellFaint: '#787c99', shellLine: '#414868',
  },
  nord: {
    label: 'Nord', dark: true, family: 'Nord',
    page: '#2e3440', surface: '#3b4252', sunken: '#292e39', line: '#4c566a', lineStrong: '#4c566a',
    ink: '#eceff4', inkSoft: '#d8dee9', inkFaint: '#a7b0bf',
    accent: '#ebcb8b', accentSoft: '#3d3a2f', ok: '#a3be8c', okSoft: '#343d31',
    shell: '#242933', shellInk: '#eceff4', shellFaint: '#8794a6', shellLine: '#434c5e',
  },
  'rose-pine': {
    label: 'Rosé Pine', dark: true, family: 'Rosé Pine',
    page: '#191724', surface: '#1f1d2e', sunken: '#141220', line: '#403d52', lineStrong: '#908caa',
    ink: '#e0def4', inkSoft: '#908caa', inkFaint: '#8983a3',
    accent: '#f6c177', accentSoft: '#2c2519', ok: '#9ccfd8', okSoft: '#1b2830',
    shell: '#141220', shellInk: '#e0def4', shellFaint: '#908caa', shellLine: '#403d52',
  },
  'rose-pine-dawn': {
    label: 'Rosé Pine Dawn', dark: false, family: 'Rosé Pine',
    page: '#f2e9e1', surface: '#faf4ed', sunken: '#f4ede8', line: '#dfdad9', lineStrong: '#797593',
    ink: '#575279', inkSoft: '#797593', inkFaint: '#7c7791',
    accent: '#b06d00', accentSoft: '#fbeed8', ok: '#286983', okSoft: '#e2edf1',
    shell: '#575279', shellInk: '#faf4ed', shellFaint: '#cecacd', shellLine: '#797593',
  },
  'everforest-dark': {
    label: 'Everforest Dark', dark: true, family: 'Everforest',
    page: '#232a2e', surface: '#2d353b', sunken: '#1e2326', line: '#475258', lineStrong: '#859289',
    ink: '#d3c6aa', inkSoft: '#9da9a0', inkFaint: '#859289',
    accent: '#dbbc7f', accentSoft: '#4d4c43', ok: '#a7c080', okSoft: '#425047',
    shell: '#1e2326', shellInk: '#d3c6aa', shellFaint: '#859289', shellLine: '#475258',
  },
  'everforest-light': {
    label: 'Everforest Light', dark: false, family: 'Everforest',
    page: '#efebd4', surface: '#fdf6e3', sunken: '#f4f0d9', line: '#e0dcc7', lineStrong: '#829181',
    ink: '#5c6a72', inkSoft: '#708089', inkFaint: '#829181',
    accent: '#b07000', accentSoft: '#faedcd', ok: '#8da101', okSoft: '#e9f0e9',
    shell: '#5c6a72', shellInk: '#fdf6e3', shellFaint: '#bdc3af', shellLine: '#708089',
  },
  kanagawa: {
    label: 'Kanagawa Wave', dark: true, family: 'Kanagawa',
    page: '#1f1f28', surface: '#2a2a37', sunken: '#16161d', line: '#54546d', lineStrong: '#717c7c',
    ink: '#dcd7ba', inkSoft: '#c8c093', inkFaint: '#a5a08a',
    accent: '#e6c384', accentSoft: '#49443c', ok: '#98bb6c', okSoft: '#2b3328',
    shell: '#16161d', shellInk: '#dcd7ba', shellFaint: '#938aa9', shellLine: '#363646',
  },
  'kanagawa-lotus': {
    label: 'Kanagawa Lotus', dark: false, family: 'Kanagawa',
    page: '#e5ddb0', surface: '#f2ecbc', sunken: '#dcd5ac', line: '#d5cea3', lineStrong: '#716e61',
    ink: '#545464', inkSoft: '#43436c', inkFaint: '#716e61',
    accent: '#836f4a', accentSoft: '#f9d791', ok: '#6f894e', okSoft: '#dfe6cf',
    shell: '#545464', shellInk: '#f2ecbc', shellFaint: '#a09cac', shellLine: '#716e61',
  },
};

/* Outside the theme contract on purpose (the colour side of the quarantine):
   the paper is paper, and the mount it sits on is a fixed neutral so that no
   palette can tint the user's judgement of print colour. */
export const PRINT = { paper: '#ffffff', mount: '#3c3c3c' };
