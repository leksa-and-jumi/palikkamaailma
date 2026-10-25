// What villagers say and trade. Trades are like Minecraft's: villagers buy
// things for emeralds and sell useful things for emeralds. Personality
// matters: grumpy villagers ask a bit more, friendly ones a bit less.

import type { Inventory, ItemStack } from './inventory';
import { itemId } from './items';
import type { Personality } from './mobs';
import type { Profession } from './villages';

export interface TradeItem {
  key: string;
  count: number;
}

export interface Trade {
  give: readonly TradeItem[];
  get: TradeItem;
}

const BASE_TRADES: Record<Profession, readonly Trade[]> = {
  farmer: [
    { give: [{ key: 'wheat', count: 20 }], get: { key: 'emerald', count: 1 } },
    { give: [{ key: 'emerald', count: 1 }], get: { key: 'bread', count: 6 } },
    { give: [{ key: 'emerald', count: 1 }], get: { key: 'apple', count: 4 } },
    { give: [{ key: 'emerald', count: 3 }], get: { key: 'pumpkin', count: 2 } },
    { give: [{ key: 'emerald', count: 6 }], get: { key: 'golden_apple', count: 1 } },
  ],
  librarian: [
    { give: [{ key: 'paper', count: 24 }], get: { key: 'emerald', count: 1 } },
    { give: [{ key: 'book', count: 4 }], get: { key: 'emerald', count: 1 } },
    { give: [{ key: 'emerald', count: 1 }], get: { key: 'glass', count: 4 } },
    { give: [{ key: 'emerald', count: 2 }], get: { key: 'lamp', count: 3 } },
    { give: [{ key: 'emerald', count: 6 }], get: { key: 'bookshelf', count: 1 } },
  ],
  smith: [
    { give: [{ key: 'coal', count: 15 }], get: { key: 'emerald', count: 1 } },
    { give: [{ key: 'iron_ingot', count: 4 }], get: { key: 'emerald', count: 1 } },
    { give: [{ key: 'emerald', count: 3 }], get: { key: 'iron_pickaxe', count: 1 } },
    { give: [{ key: 'emerald', count: 4 }], get: { key: 'iron_sword', count: 1 } },
    { give: [{ key: 'emerald', count: 9 }], get: { key: 'iron_chestplate', count: 1 } },
    { give: [{ key: 'emerald', count: 1 }], get: { key: 'slime_ball', count: 4 } },
    {
      give: [
        { key: 'emerald', count: 2 },
        { key: 'diamond', count: 1 },
      ],
      get: { key: 'diamond_sword', count: 1 },
    },
  ],
  shepherd: [
    { give: [{ key: 'white', count: 18 }], get: { key: 'emerald', count: 1 } },
    { give: [{ key: 'emerald', count: 2 }], get: { key: 'bed', count: 1 } },
    { give: [{ key: 'emerald', count: 1 }], get: { key: 'red', count: 4 } },
    { give: [{ key: 'emerald', count: 1 }], get: { key: 'blue', count: 4 } },
    { give: [{ key: 'emerald', count: 1 }], get: { key: 'yellow', count: 4 } },
    { give: [{ key: 'emerald', count: 2 }], get: { key: 'pink', count: 8 } },
  ],
};

/** How personality changes the emerald price (never below 1). */
const PRICE_CHANGE: Partial<Record<Personality, number>> = { grumpy: 1, friendly: -1 };

/** The villager's trades with their personality's prices. */
export function tradesFor(profession: Profession, personality: Personality): Trade[] {
  const change = PRICE_CHANGE[personality] ?? 0;
  return BASE_TRADES[profession].map((t) => ({
    get: t.get,
    give: t.give.map((g) =>
      g.key === 'emerald' ? { ...g, count: Math.max(1, g.count + change) } : g,
    ),
  }));
}

export function canAfford(inventory: Inventory, trade: Trade): boolean {
  return trade.give.every((g) => inventory.count(itemId(g.key)) >= g.count);
}

/** Pays and returns what you got (it may not fit: the game drops the rest). */
export function makeTrade(inventory: Inventory, trade: Trade): ItemStack | null {
  if (!canAfford(inventory, trade)) return null;
  for (const g of trade.give) inventory.removeItems(itemId(g.key), g.count);
  return { id: itemId(trade.get.key), count: trade.get.count };
}

// --- Talking ----------------------------------------------------------------

const GREETINGS: Record<Personality, readonly string[]> = {
  curious: [
    'Oho, kuka sinä olet? Mistä tulit?',
    'Mitä sinulla on repussa? Saanko kurkata?',
    'Oletko nähnyt aavikon? Minä haluaisin!',
  ],
  shy: ['Öh... hei.', 'Hmm... haluatko vaihtaa jotain?', '...moi.'],
  lazy: ['Haukotus... ai, hei.', 'Ei kiirettä, ei kiirettä.', 'Olin juuri ottamassa päiväunet.'],
  playful: [
    'Hipsis! Ota kiinni, jos saat!',
    'Hih! Arvaa mitä? Minulla on smaragdeja!',
    'Hyppää kanssani!',
  ],
  friendly: [
    'Tervetuloa kylään, ystävä!',
    'Kiva kun tulit! Katso, mitä minulla on.',
    'Hei hei! Tehdäänkö kaupat?',
  ],
  grumpy: ['Mitä nyt taas?', 'Hmph. Älä tallo kukkapenkkiä.', 'No? Osta jotain tai mene.'],
  brave: ['Pelkäätkö zombeja? En minä!', 'Hei sankari!', 'Yöllä pitää olla varovainen.'],
};

const NIGHT_LINES: readonly string[] = [
  'On jo yö! Mene sisälle, hirviöitä liikkuu.',
  'Shh... kuuletko? Zombi lähellä.',
  'Laita soihtuja, niin hirviöt pysyvät poissa.',
];

const PROFESSION_LINES: Record<Profession, string> = {
  farmer: 'Vehnästä minä tykkään!',
  librarian: 'Kirjat ovat parhaita.',
  smith: 'Takon hyviä työkaluja.',
  shepherd: 'Villaa kaikissa väreissä!',
};

/** What the villager says when you come to talk. */
export function greeting(
  personality: Personality,
  profession: Profession,
  night: boolean,
  random: () => number = Math.random,
): string {
  if (night && personality !== 'brave' && random() < 0.6) {
    return NIGHT_LINES[Math.floor(random() * NIGHT_LINES.length)]!;
  }
  const lines = GREETINGS[personality];
  const line = lines[Math.floor(random() * lines.length)]!;
  return random() < 0.3 ? `${line} ${PROFESSION_LINES[profession]}` : line;
}

/** What they say after a trade. */
export function thanks(personality: Personality): string {
  switch (personality) {
    case 'grumpy':
      return 'Hmph. Kiitos kai.';
    case 'shy':
      return '...kiitos.';
    case 'playful':
      return 'Jee! Kiitos-kiitos!';
    default:
      return 'Kiitos, kaupat tehty!';
  }
}
