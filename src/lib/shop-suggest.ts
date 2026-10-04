import type { ShopIconId } from "./shop";

// A first guess at an item's icon from the words in its title. Only the Shop screen uses this, so it
// lives apart from the rest (it is a long list of words and shouldn't weigh down the main screen).

const ICON_WORDS: [ShopIconId, string[]][] = [
  ["shoes", ["shoe", "sneaker", "boots", "sandal", "slipper", "footwear", "heels", "loafer"]],
  ["shirt", ["shirt", "tshirt", "t-shirt", "jeans", "pant", "trouser", "jacket", "hoodie", "dress", "kurta", "cloth", "sweater", "saree", "shorts", "socks", "jersey"]],
  ["headphones", ["headphone", "earbud", "earphone", "airpod", "airdope", "speaker", "soundbar", "neckband"]],
  ["phone", ["phone", "mobile", "iphone", "charger", "cable", "powerbank", "power bank", "case", "cover", "tempered"]],
  ["laptop", ["laptop", "macbook", "keyboard", "mouse", "monitor", "tablet", "ipad", "pendrive", "ssd", "router"]],
  ["tv", ["tv", "television", "projector", "console", "fire stick", "chromecast"]],
  ["watch", ["watch", "smartwatch", "fitbit", "band"]],
  ["glasses", ["glasses", "specs", "sunglass", "lens", "spectacle"]],
  ["gift", ["gift", "present", "birthday", "anniversary", "wedding"]],
  ["lamp", ["lamp", "light", "bulb", "led", "fan", "heater"]],
  ["sofa", ["sofa", "chair", "table", "desk", "bed", "mattress", "shelf", "wardrobe", "pillow", "curtain", "furniture"]],
  ["home", ["home", "kitchen", "mixer", "cooker", "bottle", "bucket", "broom", "vacuum", "iron", "towel", "bedsheet"]],
  ["food", ["food", "snack", "coffee", "tea", "grocer", "chocolate", "rice", "oil", "dry fruit", "dates"]],
  ["book", ["book", "novel", "course", "notebook", "journal", "pen", "kindle", "subscription"]],
  ["fitness", ["gym", "dumbbell", "yoga", "protein", "fitness", "mat", "creatine", "whey", "treadmill"]],
  ["beauty", ["skin", "cream", "serum", "shampoo", "perfume", "makeup", "lipstick", "beauty", "face", "sunscreen", "razor", "trimmer", "deodorant", "soap"]],
  ["baby", ["baby", "diaper", "kid", "toy", "stroller"]],
  ["games", ["game", "ps5", "xbox", "controller", "gaming", "nintendo", "steam"]],
  ["travel", ["ticket", "flight", "trip", "travel", "luggage", "suitcase", "hotel", "visa", "backpack", "trolley"]],
  ["tools", ["tool", "drill", "repair", "screwdriver", "hammer", "paint", "plumb", "wrench"]],
  ["bike", ["bike", "cycle", "helmet", "scooter", "bicycle", "tyre", "tire"]],
  ["health", ["medicine", "vitamin", "tablet", "health", "doctor", "dental", "checkup", "supplement", "bandage"]],
];

/** A first guess at the icon from the words in the title ("running shoes" -> shoes). Never wrong enough to matter: you can change it. */
export function suggestIcon(title: string): ShopIconId {
  const t = ` ${title.toLowerCase()} `;
  for (const [id, words] of ICON_WORDS) {
    // whole-word-ish: "case" shouldn't match "staircase", "tv" shouldn't match "tvs" inside a longer word
    if (words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t))) return id;
  }
  return "bag";
}
