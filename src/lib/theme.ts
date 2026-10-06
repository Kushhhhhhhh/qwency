// Two independent choices, both remembered in this browser and both applied before the first paint by a
// tiny script in the page head (see THEME_SCRIPT), so the screen never flashes the wrong colours while the
// app wakes up:
//   light / dark  - with no choice yet the device's own setting decides
//   palette       - which colours the app wears (see globals.css). With no choice ("auto") it follows the month.

export const THEME_KEY = "qwency:theme";
export type Theme = "light" | "dark";

/** What the browser chrome (status bar, address bar) is first told, per theme, before the script matches it to the real page. Keep in step with globals.css. */
export const THEME_COLOR: Record<Theme, string> = { light: "#FDF8E2", dark: "#17161F" };

export const PALETTE_KEY = "qwency:palette";
export const PALETTES = ["qwency", "autumn", "ocean", "mono"] as const;
export type Palette = (typeof PALETTES)[number];
/** What is saved: a palette, or "auto" (nothing saved) to follow the month. */
export type PaletteChoice = "auto" | Palette;

export const PALETTE_NAME: Record<Palette, string> = { qwency: "Qwency", autumn: "Autumn", ocean: "Ocean", mono: "Mono" };
export const PALETTE_HINT: Record<Palette, string> = {
  qwency: "The original lilac and cream",
  autumn: "Warm browns, apricot and wheat",
  ocean: "Cool blues, sand and seafoam",
  mono: "Paper and ink, in greys",
};

/** Which palette each month wears on "auto" (January first): a quiet winter, the original in spring, sea in summer, autumn in autumn. */
export const SEASONS: readonly Palette[] = ["mono", "mono", "qwency", "qwency", "qwency", "ocean", "ocean", "ocean", "autumn", "autumn", "autumn", "mono"];

export const isPalette = (v: unknown): v is Palette => typeof v === "string" && (PALETTES as readonly string[]).includes(v);

/** The palette to wear: the saved one, or this month's when nothing valid is saved. `month` is 0 for January, as in Date#getMonth. */
export function paletteFor(saved: unknown, month: number): Palette {
  return isPalette(saved) ? saved : SEASONS[(((Math.trunc(month) || 0) % 12) + 12) % 12];
}

/**
 * Whether Shop is switched on is part of your setup (so it follows you to every device). A small cookie keeps a
 * copy here, so the bottom bar in the loading picture is drawn with the right tabs from the first paint:
 * the head script below turns it into `data-shop="1"` on <html>, and the picture hides its Shop tab without it.
 * Otherwise the bar would be drawn with one tab too many and lose it once the page wakes up.
 */
export const SHOP_COOKIE = "qs";

/** Runs in the head, before anything is drawn. Must stay tiny, dependency-free and never throw. Reading the saved choices, asking the device and setting each attribute are separate steps, so blocked storage still follows the device and a failure in one never stops the others. The last lines tell the phone's bar what colour the page really is, once the styles have arrived. */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,t=null,p=null;try{t=localStorage.getItem("${THEME_KEY}");p=localStorage.getItem("${PALETTE_KEY}")}catch(e){}try{if(document.cookie.indexOf("${SHOP_COOKIE}=1")>=0)d.setAttribute("data-shop","1")}catch(e){}try{if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.setAttribute("data-theme",t)}catch(e){}try{if(${JSON.stringify(PALETTES)}.indexOf(p)<0)p=${JSON.stringify(SEASONS)}[new Date().getMonth()];d.setAttribute("data-palette",p);var b=function(){var c=getComputedStyle(d).backgroundColor;if(c!=="rgba(0, 0, 0, 0)")document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",c)})};document.addEventListener("DOMContentLoaded",b);addEventListener("load",b)}catch(e){}})()`;

/** After the theme or palette changes: make the phone's own bar match the page it sits over. */
export function syncBarColor() {
  const c = getComputedStyle(document.documentElement).backgroundColor;
  if (!c || c === "rgba(0, 0, 0, 0)") return;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", c));
}
