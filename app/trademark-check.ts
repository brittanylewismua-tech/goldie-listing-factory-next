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


/**
 * PROFESSIONAL TEAMS, AND WHY MOST OF THEM NEED THEIR CITY.
 *
 * A "Philly Eagles Sweatshirt" reached the live Hot List — an NFL mark shown
 * to a seller as inspiration, which is the exact listing that closes a shop.
 * The leagues police this harder than almost anybody.
 *
 * But nearly every team name is an ordinary English word. Flagging a bare
 * "eagles" would condemn every "eagles wings" verse shirt, "bears" would take
 * the whole woodland nursery niche, and "saints" would take half the Christian
 * market. So ambiguous names are only a mark when they carry their city, and
 * only the genuinely distinctive ones stand alone.
 */
const TEAMS_WITH_CITY: [string, string][] = [
  ["arizona|phoenix", "cardinals"], ["atlanta", "falcons|hawks|braves"],
  ["baltimore", "ravens|orioles"], ["buffalo", "bills|sabres"],
  ["carolina", "panthers|hurricanes"], ["chicago", "bears|bulls|cubs|blackhawks|white sox"],
  ["cincinnati", "bengals|reds"], ["cleveland", "browns|guardians|cavaliers|cavs"],
  ["dallas", "cowboys|mavericks|mavs|stars"], ["denver", "broncos|nuggets|avalanche"],
  ["detroit", "lions|tigers|pistons|red wings"], ["green bay", "packers"],
  ["houston", "texans|astros|rockets"], ["indiana(polis)?", "colts|pacers"],
  ["jacksonville", "jaguars"], ["kansas city", "chiefs|royals"],
  ["las vegas|vegas|oakland", "raiders|golden knights"],
  ["los angeles|la|anaheim", "rams|chargers|lakers|clippers|dodgers|angels|kings|ducks"],
  ["miami", "dolphins|heat|marlins"], ["minnesota", "vikings|twins|wild"],
  ["new england", "patriots"], ["new orleans", "saints|pelicans"],
  ["new york|ny|brooklyn", "giants|jets|knicks|nets|mets|yankees|rangers|islanders"],
  ["philadelphia|philly", "eagles|phillies|sixers|76ers|flyers"],
  ["pittsburgh", "steelers|pirates|penguins"],
  ["san francisco|sf", "giants|warriors"],
  ["seattle", "seahawks|mariners|kraken"],
  ["tampa bay|tampa", "buccaneers|bucs|rays|lightning"],
  ["tennessee", "titans"], ["washington", "commanders|nationals|capitals|wizards"],
  ["boston", "celtics|red sox|bruins"], ["milwaukee", "bucks|brewers"],
  ["portland", "trail blazers|blazers"], ["utah", "jazz"],
  ["san antonio", "spurs"], ["oklahoma city|okc", "thunder"],
  ["sacramento", "kings"], ["orlando", "magic"], ["memphis", "grizzlies"],
  ["toronto", "raptors|maple leafs|blue jays"], ["st louis|saint louis", "cardinals|blues"],
];

/** Distinctive enough to stand alone — nobody writes these by accident. */
const TEAMS_ALONE = [
  "49ers", "niners", "seahawks", "buccaneers", "bengals", "packers",
  "steelers", "canadiens", "penguins", "blackhawks", "mavericks",
  "timberwolves", "diamondbacks", "athletics", "phillies", "yankees",
  "dodgers", "lakers", "celtics", "knicks", "cowboys",
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
/* Built once. A city and its team in either order, within a few words. */
const TEAM_PATTERNS: RegExp[] = [
  ...TEAMS_WITH_CITY.map(([city, names]) =>
    new RegExp(`\\b(?:(?:${city})\\W+(?:\\w+\\W+){0,2}?(?:${names})|(?:${names})\\W+(?:\\w+\\W+){0,2}?(?:${city}))\\b`, "gi")),
  new RegExp(`\\b(${TEAMS_ALONE.join("|")})\\b`, "gi"),
];

function findHits(phrase: string): Hit[] {
  const hits: Hit[] = [];

  for (const pattern of TEAM_PATTERNS) {
    pattern.lastIndex = 0;
    let found: RegExpExecArray | null;
    while ((found = pattern.exec(phrase)) !== null) {
      hits.push({
        matched: found[0],
        owner: "a professional sports team",
        category: "Sport",
        at: found.index,
        length: found[0].length,
      });
      if (pattern.lastIndex === found.index) pattern.lastIndex++;
    }
  }

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
        DELIBERATELY NOT "THIS IS SAFE", AND NOT A CLAIM ABOUT CHARACTERS.

        The old wording — "No known brands, characters or franchises in this
        phrase" — asserted three things this code does not check. Nothing here
        looks for characters, franchises or copyrighted properties; it matches
        a curated risk list and the federal trademark register. Saying
        otherwise is the sentence a seller would quote back after losing a
        shop, so the summary now names only what was actually searched.

        `withRegister` replaces this line with one that says whether the
        register was complete, because a register still loading cannot produce
        a clean result at all.
      */
      summary: "No match was found in the trademark records currently loaded.",
    };

  const owners = [...new Set(hits.map(hit => hit.owner))];
  const named = owners.length === 1
    ? owners[0]
    : `${owners.slice(0, -1).join(", ")} and ${owners[owners.length - 1]}`;

  return {
    phrase,
    risk: "high",
    hits,
    /*
      ASSOCIATED WITH, NOT OWNED BY.

      The old wording — "uses property owned by Disney" — asserted a legal
      fact this code has not established. It matched a curated list of names
      that get listings removed; it did not determine who owns what, and a
      screening tool that states ownership is making a claim it cannot stand
      behind. What it can honestly say is that the phrase is associated with
      that party and carries high commercial risk.
    */
    summary: `This phrase is associated with ${named} and presents a high `
      + `intellectual-property risk for commercial use. Listings using it are `
      + `frequently removed, and repeat removals can close a shop. This is `
      + `screening information, not legal clearance.`,
  };
}


/**
 * A CHEAP SCREEN FOR THE HOT LIST.
 *
 * `check` runs a hundred and fifty patterns and builds offsets, which is right
 * for one phrase a seller typed and far too slow for every row of a board. One
 * compiled alternation answers the only question the board asks: does this
 * title lean on somebody's mark at all?
 */
const ANY_MARK = new RegExp(
  `\\b(${MARKS.map(mark => mark.term).join("|")}|${TEAMS_ALONE.join("|")})\\b`, "i");

export function mentionsAMark(title: string) {
  const text = String(title ?? "");
  if (ANY_MARK.test(text)) return true;
  return TEAM_PATTERNS.some(pattern => { pattern.lastIndex = 0; return pattern.test(text); });
}

/**
 * THE FEDERAL REGISTER, FOLDED IN.
 *
 * The curated list above is the fast screen for the things that actually get
 * shops closed. The register is the long tail: half a million live marks in
 * the classes sellers print on, most of which no one has heard of. Both
 * matter, and they are not equally alarming, so they are not said the same
 * way.
 *
 * A REGISTRATION ON A COMMON WORD IS NOT A BAN. "Love" is registered for
 * clothing by somebody. Shouting about it would train sellers to ignore this
 * tool, which is worse than not having one. So a single ordinary word that
 * merely appears inside the phrase is a caution with the owner named, while
 * the whole phrase being somebody's registered mark, or a multi-word mark
 * sitting inside it, is the real thing.
 */
export type RegisterMatch = {
  mark: string;
  owner: string;
  registration: string;
  classes: string[];
  registered: boolean;
  /** True when the phrase is the mark, rather than merely containing it. */
  exact: boolean;
};

export type FullVerdict = Verdict & {
  register: RegisterMatch[];
  /** False while the register is still filling, so the page can say so. */
  registerReady: boolean;
};

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/*
  ONE PLACE THAT DECIDES WHETHER THE REGISTER IS COMPLETE.

  Four call sites computed this. Three of them wrote the same two-line rule by
  hand; the fourth — the LISTING FACTORY'S PUBLISH-TIME CHECK — passed the
  size object itself where the boolean goes:

    withRegister(check(phrase), hits, size)

  An object is always truthy, so the path that runs when a member is about to
  publish has been reporting a COMPLETE federal register search, in those
  words, while 79 of 113 bulk files were still waiting. The one screen where
  the limitation matters most is the one screen that hid it.

  `size` is exactly what registerSize returns, so the shape cannot be passed
  to the wrong parameter any more — it is the parameter.
*/
export type RegisterSize = { marks: number; files: { state: string; count: number }[] };

export function registerIsReady(size: RegisterSize | null | undefined) {
  if (!size || !(size.marks > 0)) return false;
  return !size.files.some(file => file.state === "waiting" || file.state === "partial");
}

/*
  D1705 · READY IS NOT THE SAME AS COMPLETE.

  registerIsReady asks whether the queue has stopped moving. It ignores
  `skipped`, which is correct for its purpose — a file that can never be read
  must not hold the queue open forever — but it was also driving the sentence
  a member reads on a clean result:

    "No exact or contained match was found in the CURRENT FEDERAL TRADEMARK
     REGISTER or the curated risk list."

  Three files are already parked as unreadable, and D1704 gives indefinitely
  throttled files the same terminal state so the backfile can finish at all.
  So the moment the queue empties, that sentence would claim a search of the
  whole register while the marks from every parked file were missing from it —
  the same overstatement D1693 removed from a menu, reached instead through a
  state change nobody would have looked at again.

  Final and complete are different facts and now have different names. The
  member gets the stronger sentence only when nothing was left out.
*/
export function registerIsComplete(size: RegisterSize | null | undefined) {
  if (!registerIsReady(size)) return false;
  return !size!.files.some(file => file.state === "skipped" && file.count > 0);
}

/** How many files the register could not read, for the sentence below. */
export function registerParkedFiles(size: RegisterSize | null | undefined) {
  if (!size) return 0;
  return size.files
    .filter(file => file.state === "skipped")
    .reduce((total, file) => total + Number(file.count ?? 0), 0);
}

/*
  AND ONE PLACE THAT SHAPES A HIT INTO A MATCH.

  The same call site passed raw lookup rows straight in, so `exact` was
  undefined on every one of them. `serious` requires exact OR a multi-word
  mark, which means an EXACT SINGLE-WORD registered trademark was quietly
  downgraded from high risk to a minor mention — on the publish path.
*/
export function toMatches(
  hits: Array<{ mark: string; owner?: string; registration?: string;
    classes?: string; registered?: boolean }>,
  phrase: string,
  /* Injected rather than imported: the normaliser lives beside the register
     reader, and this module stays free of anything that touches a database.
     Named distinctly so the import-integrity guard can tell a parameter from
     a symbol borrowed off another module. */
  normalizeMark: (value: string) => string,
): RegisterMatch[] {
  const wanted = normalizeMark(phrase);
  return hits.map(hit => ({
    mark: hit.mark, owner: hit.owner, registration: hit.registration,
    classes: hit.classes, registered: hit.registered,
    exact: normalizeMark(hit.mark) === wanted,
  })) as RegisterMatch[];
}

export function withRegister(
  verdict: Verdict,
  matches: RegisterMatch[],
  /*
    D1705 · The size object, not a boolean derived from it.

    This parameter used to be `registerReady: boolean`, and the comment above
    registerIsReady records what that cost: one call site passed the size
    object where the boolean went, an object is always truthy, and the
    publish-time check reported a complete federal register search while 79 of
    113 files were still waiting.

    Two booleans are now needed rather than one, and adding a second would
    double that risk. So the shape that cannot be got wrong is the parameter,
    and both facts are derived here.
  */
  size: RegisterSize | null | undefined,
): FullVerdict {
  const registerReady = registerIsReady(size);
  const registerComplete = registerIsComplete(size);
  const serious = matches.filter(
    match => match.registered && (match.exact || words(match.mark) > 1),
  );
  const minor = matches.filter(match => !serious.includes(match));

  /*
    A CLEAN RESULT REQUIRES A COMPLETE REGISTER.

    "No match found" over a half-loaded register is not a clean search, and a
    member reading the headline alone must not be able to mistake it for one.
    So the summary itself carries the state — the warning beneath it is a
    reinforcement, never the only place the limitation appears.
  */
  if (verdict.risk === "high") return { ...verdict, register: matches, registerReady };

  if (!matches.length)
    return {
      ...verdict,
      register: matches,
      registerReady,
      summary: verdict.risk === "clear"
        ? (registerReady
          ? (registerComplete
            ? "No exact or contained match was found in the current federal "
              + "trademark register or the curated risk list. This is "
              + "screening information, not legal clearance."
            /* Final, but with files the register could never read. The
               sentence says what was searched and does not name the whole
               register. */
            : "No exact or contained match was found in the trademark records "
              + "that could be read, or the curated risk list. A few records "
              + "could not be loaded at all, so this is not the whole "
              + "register. This is screening information, not legal "
              + "clearance.")
          : "No match was found in the trademark records currently loaded. "
            + "This is screening information, not legal clearance.")
        : verdict.summary,
    };

  if (serious.length) {
    const first = serious[0];
    return {
      ...verdict,
      risk: "high",
      register: matches,
      registerReady,
      summary: first.exact
        ? `“${first.mark}” is a live registered trademark${first.owner ? `, owned by ${first.owner}` : ""}. Using it as the phrase on a product is what gets a listing removed.`
        : `This phrase contains “${first.mark}”, a live registered trademark${first.owner ? ` owned by ${first.owner}` : ""}. Printing it risks the listing being removed.`,
    };
  }

  const named = [...new Set(minor.map(match => match.mark))].slice(0, 3).join(", ");
  return {
    ...verdict,
    risk: "caution",
    register: matches,
    registerReady,
    summary: `No famous brands here, but ${named} ${minor.length > 1 ? "are" : "is"} registered for clothing and print by somebody else. A registration on an ordinary word does not stop you using it, and it does mean the owner can object — worth a look before you scale it.`,
  };
}
