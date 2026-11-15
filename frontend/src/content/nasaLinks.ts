// Outside links for the "Real NASA missions" section. Every URL was checked to load (2026-11-15); the dataset DOIs and
// the paper come from data/SOURCES.md. Links only — nothing here is fetched at runtime (I-20: the demo works offline).
export interface MissionLink { label: string; href: string; note?: string }
export interface Mission {
  id: "FLEX" | "Saffire";
  name: string; full: string; where: string; what: string; why: string;
  links: MissionLink[];
}

export const MISSIONS: Mission[] = [
  {
    id: "FLEX", name: "FLEX", full: "Flame Extinguishment Experiment", where: "International Space Station",
    what: "Astronauts lit single fuel droplets (heptane, methanol) inside a sealed chamber on the ISS and filmed how they burned and when they went out.",
    why: "Every heptane and methanol prediction on this site is learned from these runs.",
    links: [
      { label: "FLEX dataset", href: "https://doi.org/10.60555/mbq8-0451", note: "NASA Physical Sciences repository (PSI-69)" },
      { label: "NASA research paper", href: "https://ntrs.nasa.gov/api/citations/20120016855/downloads/20120016855.pdf", note: "Methanol droplet extinction in microgravity (PDF)" },
    ],
  },
  {
    id: "Saffire", name: "Saffire", full: "Spacecraft Fire Safety Experiment", where: "Cygnus cargo ships, after leaving the ISS",
    what: "NASA set large sheets of real spacecraft materials on fire inside empty cargo ships before they re-entered the atmosphere — fires too big to ever light near a crew.",
    why: "Shows how fires on real spacecraft materials (fabric, Plexiglas, silicone) actually spread.",
    links: [
      { label: "Saffire-II dataset", href: "https://doi.org/10.60555/2chp-m469", note: "NASA Physical Sciences repository (PSI-99)" },
    ],
  },
];

export const STATION_LINKS: (MissionLink & { icon: string })[] = [
  { icon: "📡", label: "Watch NASA live", href: "https://www.nasa.gov/live/", note: "Live streams, including views from the space station" },
  { icon: "🛰", label: "Spot the Station", href: "https://www.nasa.gov/spot-the-station/", note: "See when the ISS passes over you" },
  { icon: "🌍", label: "Astronaut photos of Earth", href: "https://eol.jsc.nasa.gov/", note: "Every photo taken from the ISS" },
  { icon: "🔬", label: "ISS Research Explorer", href: "https://www.nasa.gov/mission/station/research-explorer/", note: "Search every experiment flown on the station" },
  { icon: "🏠", label: "International Space Station", href: "https://www.nasa.gov/international-space-station/", note: "NASA's ISS home page" },
];
