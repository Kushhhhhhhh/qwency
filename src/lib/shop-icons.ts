import {
  Baby,
  Bike,
  BookOpen,
  Coffee,
  Dumbbell,
  Footprints,
  Gamepad2,
  Gift,
  Glasses,
  Headphones,
  Home,
  Laptop,
  Lamp,
  Pill,
  Plane,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sofa,
  Sparkles,
  Tv,
  Watch,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ShopIconId } from "./shop";

// The drawing for each of the Shop icons. Only the Shop screen loads this file.
const ICONS: Record<ShopIconId, LucideIcon> = {
  bag: ShoppingBag,
  cart: ShoppingCart,
  shirt: Shirt,
  shoes: Footprints,
  phone: Smartphone,
  headphones: Headphones,
  laptop: Laptop,
  tv: Tv,
  watch: Watch,
  glasses: Glasses,
  gift: Gift,
  home: Home,
  lamp: Lamp,
  sofa: Sofa,
  food: Coffee,
  book: BookOpen,
  fitness: Dumbbell,
  beauty: Sparkles,
  baby: Baby,
  games: Gamepad2,
  travel: Plane,
  tools: Wrench,
  bike: Bike,
  health: Pill,
};

const LABELS: Record<ShopIconId, string> = {
  bag: "Bag", cart: "Cart", shirt: "Clothes", shoes: "Shoes", phone: "Phone", headphones: "Audio",
  laptop: "Laptop", tv: "TV", watch: "Watch", glasses: "Glasses", gift: "Gift", home: "Home",
  lamp: "Lamp", sofa: "Furniture", food: "Food", book: "Books", fitness: "Fitness", beauty: "Beauty",
  baby: "Baby", games: "Games", travel: "Travel", tools: "Tools", bike: "Bike", health: "Health",
};

export const shopIcon = (id: string): LucideIcon => ICONS[id as ShopIconId] ?? ShoppingBag;
export const shopIconLabel = (id: string): string => LABELS[id as ShopIconId] ?? "Bag";
