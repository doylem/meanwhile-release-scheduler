const STORAGE_KEY = 'meanwhile-custom-artists';

export const BUILTIN_ARTISTS: string[] = [
  'Alex O\'Rion',
  'Amháin',
  'Analog Jungs',
  'Andrea Cassino',
  'Andrés Moris',
  'Cid Inc.',
  'Dabeat',
  'Dimuth K',
  'Disto (SL)',
  'Dowden',
  'EANP',
  'EMPHI',
  'Ezequiel Arias',
  'Forerunners',
  'Forty Cats',
  'Fran Garay',
  'Gai Barone',
  'GMJ',
  'Golan Zocher',
  'Gorkiz',
  'Graziano Raffa',
  'HAFT',
  'Hernan Cattaneo',
  'Hobin Rude',
  'Imran Khan',
  'Ivan Aliaga',
  'Jamie Stevens',
  'Jiminy Hop',
  'Juan Deminicis',
  'Kamilo Sanclemente',
  'Karl Pilbrow',
  'Kasey Taylor',
  'Kasper Koman',
  'Kostya Outta',
  'Lonya',
  'Luka Sambe',
  'Marcelo Vasami',
  'Marsh',
  'Matias Chilano',
  'Matter',
  'Maze 28',
  'Meeting Molly',
  'Michael A',
  'Michael Bennett',
  'Mike Griego',
  'Mike Isai',
  'Mike Rish',
  'Navar',
  'Nicolas Rada',
  'NOIYSE PROJECT',
  'Not Demure',
  'Nōpi',
  'Patch Park',
  'Paul Deep (AR)',
  'Paul Kardos',
  'Rich Curtis',
  'RIGOONI',
  'Roger Martinez',
  'Ruben Karapetyan',
  'RYAN (CU)',
  'Sam Scheme',
  'Sebastian Sellares',
  'Simos Tagias',
  'Stereo Underground',
  'Subandrio',
  'Tantum',
  'Tommi Oskari',
  'Tonaco',
  'Tripswitch',
  'Weird Sounding Dude',
  'Wilma (AU)',
  'YANIQ',
  'Zankee Gulati',
];

function getCustomArtists(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** Returns the full merged list, sorted alphabetically. */
export function getAllArtists(): string[] {
  const combined = [...BUILTIN_ARTISTS, ...getCustomArtists()];
  return combined.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Saves a new artist name to localStorage.
 * Returns true if it was actually new and added, false if already known (case-insensitive).
 */
export function saveCustomArtist(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || typeof window === 'undefined') return false;
  const known = [...BUILTIN_ARTISTS, ...getCustomArtists()];
  if (known.some((a) => a.toLowerCase() === trimmed.toLowerCase())) return false;
  const custom = getCustomArtists();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...custom, trimmed]));
  return true;
}
