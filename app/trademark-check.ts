/**
 * IS THIS PHRASE GOING TO GET THE SHOP SHUT DOWN?
 *
 * The single most expensive mistake a print-on-demand seller makes is putting
 * somebody else's property on a shirt. Etsy removes the listing, and a repeat
 * offender loses the shop — years of work, over a phrase that took ten seconds
 * to type.
 *
 * WHAT THIS IS. A check against the names that actually get people removed:
 * characters, studios, bands, teams, brands. It is curated for print-on-demand
 * rather than scraped from everything, which is why it catches "Bluey" and
 * "Eras Tour" and does not drown the answer in irrelevant marks for industrial
 * lubricants.
 *
 * WHAT IT IS NOT, AND THE PAGE MUST SAY SO. It is not a search of the federal
 * register, and it is not legal advice. A clean result here means "none of the
 * usual traps", not "nobody owns this". The comprehensive version — a full
 * index of live US marks in the classes sellers actually print on, built from
 * USPTO's free bulk data — replaces this list without changing anything a
 * seller sees.
 *
 * No Cloudflare imports on purpose: the matching is the part that has to be
 * right, so it stays testable on its own.
 */

export type Risk = "clear" | "caution" | "high";

export type Category =
  | "Character or franchise"
  | "Music"
  | "Sport"
  | "Brand"
  | "Film or television"
  | "Game"
  | "Phrase";

export type Mark = {
  /** What to look for. Matched as whole words, case-insensitively. */
  term: string;
  /** Who it belongs to, said plainly. */
  owner: string;
  category: Category;
};

/**
 * The names that get listings pulled.
 *
 * Grown from the blocklist the Hot List already used to keep protected work
 * off the board — the same problem seen from the other side, so the two should
 * never disagree about what is risky.
 */
export const MARKS: Mark[] = [
  // Character or franchise
  { term: "disney", owner: "Disney", category: "Character or franchise" },
  { term: "pixar", owner: "Disney", category: "Character or franchise" },
  { term: "mickey mouse", owner: "Disney", category: "Character or franchise" },
  { term: "mouse ears", owner: "Disney", category: "Character or franchise" },
  { term: "cinderella", owner: "Disney", category: "Character or franchise" },
  { term: "snow white", owner: "Disney", category: "Character or franchise" },
  { term: "little mermaid", owner: "Disney", category: "Character or franchise" },
  { term: "beauty and the beast", owner: "Disney", category: "Character or franchise" },
  { term: "lion king", owner: "Disney", category: "Character or franchise" },
  { term: "frozen", owner: "Disney", category: "Character or franchise" },
  { term: "moana", owner: "Disney", category: "Character or franchise" },
  { term: "marvel", owner: "Marvel / Disney", category: "Character or franchise" },
  { term: "spider ?man", owner: "Marvel / Disney", category: "Character or franchise" },
  { term: "spiderverse", owner: "Marvel / Disney", category: "Character or franchise" },
  { term: "avengers", owner: "Marvel / Disney", category: "Character or franchise" },
  { term: "star wars", owner: "Lucasfilm / Disney", category: "Character or franchise" },
  { term: "mandalorian", owner: "Lucasfilm / Disney", category: "Character or franchise" },
  { term: "yoda", owner: "Lucasfilm / Disney", category: "Character or franchise" },
  { term: "batman", owner: "DC / Warner Bros.", category: "Character or franchise" },
  { term: "superman", owner: "DC / Warner Bros.", category: "Character or franchise" },
  { term: "dc comics", owner: "DC / Warner Bros.", category: "Character or franchise" },
  { term: "harry potter", owner: "Warner Bros.", category: "Character or franchise" },
  { term: "hogwarts", owner: "Warner Bros.", category: "Character or franchise" },
  { term: "hello kitty", owner: "Sanrio", category: "Character or franchise" },
  { term: "sanrio", owner: "Sanrio", category: "Character or franchise" },
  { term: "barbie", owner: "Mattel", category: "Character or franchise" },
  { term: "bluey", owner: "BBC / Ludo Studio", category: "Character or franchise" },
  { term: "peppa", owner: "Hasbro", category: "Character or franchise" },
  { term: "paw patrol", owner: "Paramount", category: "Character or franchise" },
  { term: "sesame street", owner: "Sesame Workshop", category: "Character or franchise" },
  { term: "looney tunes", owner: "Warner Bros.", category: "Character or franchise" },
  { term: "spongebob", owner: "Paramount", category: "Character or franchise" },
  { term: "scooby", owner: "Warner Bros.", category: "Character or franchise" },
  { term: "little prince", owner: "Saint-Exupéry estate", category: "Character or franchise" },
  { term: "totoro", owner: "Studio Ghibli", category: "Character or franchise" },
  { term: "studio ghibli", owner: "Studio Ghibli", category: "Character or franchise" },
  { term: "sailor moon", owner: "Naoko Takeuchi / Kodansha", category: "Character or franchise" },
  { term: "dragon ball", owner: "Toei / Shueisha", category: "Character or franchise" },
  { term: "naruto", owner: "Shueisha", category: "Character or franchise" },
  { term: "one piece anime", owner: "Shueisha", category: "Character or franchise" },
  { term: "mazinger", owner: "Dynamic Planning", category: "Character or franchise" },
  { term: "polo bear", owner: "Ralph Lauren", category: "Character or franchise" },

  // Film or television
  { term: "stranger things", owner: "Netflix", category: "Film or television" },
  { term: "wednesday addams", owner: "Netflix / Tee and Charles Addams Foundation", category: "Film or television" },
  { term: "squid game", owner: "Netflix", category: "Film or television" },
  { term: "game of thrones", owner: "HBO", category: "Film or television" },
  { term: "the office", owner: "NBCUniversal", category: "Film or television" },
  { term: "simpsons", owner: "Disney", category: "Film or television" },
  { term: "family guy", owner: "Disney", category: "Film or television" },
  { term: "rick and morty", owner: "Warner Bros. Discovery", category: "Film or television" },
  { term: "south park", owner: "Paramount", category: "Film or television" },
  { term: "saturday night live", owner: "NBCUniversal", category: "Film or television" },
  { term: "pee ?wee herman", owner: "Paul Reubens estate", category: "Film or television" },
  { term: "talladega nights", owner: "Sony", category: "Film or television" },
  { term: "step brothers", owner: "Sony", category: "Film or television" },
  { term: "shaun the sheep", owner: "Aardman", category: "Film or television" },
  { term: "adventures in odyssey", owner: "Focus on the Family", category: "Film or television" },

  // Game
  { term: "pokemon", owner: "The Pokémon Company", category: "Game" },
  { term: "pikachu", owner: "The Pokémon Company", category: "Game" },
  { term: "nintendo", owner: "Nintendo", category: "Game" },
  { term: "mario", owner: "Nintendo", category: "Game" },
  { term: "zelda", owner: "Nintendo", category: "Game" },
  { term: "sonic", owner: "Sega", category: "Game" },
  { term: "minecraft", owner: "Microsoft", category: "Game" },
  { term: "roblox", owner: "Roblox", category: "Game" },
  { term: "fortnite", owner: "Epic Games", category: "Game" },
  { term: "fallout", owner: "Bethesda", category: "Game" },
  { term: "halo", owner: "Microsoft", category: "Game" },
  { term: "call of duty", owner: "Activision", category: "Game" },
  { term: "among us", owner: "Innersloth", category: "Game" },
  { term: "stardew valley", owner: "ConcernedApe", category: "Game" },
  { term: "junimo", owner: "ConcernedApe", category: "Game" },
  { term: "outer wilds", owner: "Mobius Digital", category: "Game" },
  { term: "dungeon meshi", owner: "Kadokawa", category: "Game" },
  { term: "delicious in dungeon", owner: "Kadokawa", category: "Game" },

  // Music
  { term: "taylor swift", owner: "Taylor Swift", category: "Music" },
  { term: "swiftie", owner: "Taylor Swift", category: "Music" },
  { term: "eras tour", owner: "Taylor Swift", category: "Music" },
  { term: "beyonce", owner: "Beyoncé", category: "Music" },
  { term: "bts", owner: "HYBE", category: "Music" },
  { term: "kpop demon", owner: "Netflix / HYBE", category: "Music" },
  { term: "olivia rodrigo", owner: "Olivia Rodrigo", category: "Music" },
  { term: "sabrina carpenter", owner: "Sabrina Carpenter", category: "Music" },
  { term: "grateful dead", owner: "Grateful Dead", category: "Music" },
  { term: "nirvana", owner: "Nirvana LLC", category: "Music" },
  { term: "metallica", owner: "Metallica", category: "Music" },
  { term: "ac ?dc", owner: "AC/DC", category: "Music" },
  { term: "pink floyd", owner: "Pink Floyd", category: "Music" },
  { term: "beatles", owner: "Apple Corps", category: "Music" },
  { term: "elvis", owner: "Elvis Presley Enterprises", category: "Music" },

  // Sport
  { term: "nfl", owner: "NFL", category: "Sport" },
  { term: "nba", owner: "NBA", category: "Sport" },
  { term: "mlb", owner: "MLB", category: "Sport" },
  { term: "nhl", owner: "NHL", category: "Sport" },
  { term: "super bowl", owner: "NFL", category: "Sport" },
  { term: "olympics", owner: "IOC", category: "Sport" },
  { term: "dallas cowboys", owner: "NFL", category: "Sport" },
  { term: "yankees", owner: "MLB", category: "Sport" },
  { term: "lakers", owner: "NBA", category: "Sport" },
  { term: "kentucky wildcats", owner: "University of Kentucky", category: "Sport" },
  { term: "millwall", owner: "Millwall FC", category: "Sport" },
  { term: "liverpool fc", owner: "Liverpool FC", category: "Sport" },

  // Brand
  { term: "nike", owner: "Nike", category: "Brand" },
  { term: "adidas", owner: "Adidas", category: "Brand" },
  { term: "supreme", owner: "Supreme", category: "Brand" },
  { term: "gucci", owner: "Gucci", category: "Brand" },
  { term: "louis vuitton", owner: "Louis Vuitton", category: "Brand" },
  { term: "chanel", owner: "Chanel", category: "Brand" },
  { term: "prada", owner: "Prada", category: "Brand" },
  { term: "north face", owner: "The North Face", category: "Brand" },
  { term: "carhartt", owner: "Carhartt", category: "Brand" },
  { term: "starbucks", owner: "Starbucks", category: "Brand" },
  { term: "coca ?cola", owner: "Coca-Cola", category: "Brand" },
  { term: "pepsi", owner: "PepsiCo", category: "Brand" },
  { term: "mcdonald", owner: "McDonald's", category: "Brand" },
  { term: "in ?n ?out", owner: "In-N-Out", category: "Brand" },
  { term: "trader joe'?s", owner: "Trader Joe's", category: "Brand" },
  { term: "jeep", owner: "Stellantis", category: "Brand" },
  { term: "ford", owner: "Ford", category: "Brand" },
  { term: "chevy", owner: "GM", category: "Brand" },
  { term: "tesla", owner: "Tesla", category: "Brand" },
  { term: "porsche", owner: "Porsche", category: "Brand" },
  { term: "bmw", owner: "BMW", category: "Brand" },
  { term: "honda civic", owner: "Honda", category: "Brand" },
  { term: "subaru", owner: "Subaru", category: "Brand" },
  { term: "john deere", owner: "John Deere", category: "Brand" },
  { term: "harley davidson", owner: "Harley-Davidson", category: "Brand" },
  { term: "jack daniels", owner: "Jack Daniel's", category: "Brand" },
  { term: "budweiser", owner: "AB InBev", category: "Brand" },
];

export type Hit = {
  matched: string;
  owner: string;
  category: Category;
  /** Where in the phrase it was found, so the page can point at it. */
  at: number;
  length: number;
};

export type Verdict = {
  phrase: string;
  risk: Risk;
  hits: Hit[];
  /** One sentence a seller can act on. */
  summary: string;
};

/**
 * WHOLE WORDS ONLY, ALWAYS.
 *
 * This codebase has already been bitten once by substring matching: a keyword
 * parser rejected "Vintage Golf Decor" because "vin-TAG-e" contains "tag", and
 * a seller watched their entry silently vanish. A trademark checker doing the
 * same would flag "Ford" inside "afford", "halo" inside "shalom", and "mario"
 * inside "marionette" — and a checker that cries wolf is one people learn to
 * ignore, which is worse than not having it.
 */
function findHits(phrase: string): Hit[] {
  const hits: Hit[] = [];
  for (const mark of MARKS) {
    const pattern = new RegExp(`\\b${mark.term}\\b`, "gi");
    let found: RegExpExecArray | null;
    while ((found = pattern.exec(phrase)) !== null) {
      hits.push({
        matched: found[0],
        owner: mark.owner,
        category: mark.category,
        at: found.index,
        length: found[0].length,
      });
      if (pattern.lastIndex === found.index) pattern.lastIndex++;
    }
  }
  /* Earliest first, so the page can read left to right through the phrase. */
  return hits.sort((a, b) => a.at - b.at);
}

export function check(raw: string): Verdict {
  const phrase = String(raw ?? "").trim();
  if (!phrase)
    return { phrase, risk: "clear", hits: [], summary: "Type a phrase to check it." };

  const hits = findHits(phrase);

  if (!hits.length)
    return {
      phrase,
      risk: "clear",
      hits,
      /*
        DELIBERATELY NOT "THIS IS SAFE".

        The list is the common traps, not the federal register, and a checker
        that says "safe" is making a promise it cannot keep — the one a seller
        would quote back after losing a shop.
      */
      summary: "No known brands, characters or franchises in this phrase.",
    };

  const owners = [...new Set(hits.map(hit => hit.owner))];
  const named = owners.length === 1
    ? owners[0]
    : `${owners.slice(0, -1).join(", ")} and ${owners[owners.length - 1]}`;

  return {
    phrase,
    risk: "high",
    hits,
    summary: `This phrase uses property owned by ${named}. Printing it risks the listing being removed, and repeat removals can close a shop.`,
  };
}
