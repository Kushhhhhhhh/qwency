// Light / dark. The choice is remembered in this browser; with no choice yet the device's own setting
// decides. It is applied before the first paint by a tiny script in the page head (see THEME_SCRIPT),
// so a dark screen never flashes light while the app wakes up.

export const THEME_KEY = "qwency:theme";
export type Theme = "light" | "dark";

/** What the browser chrome (status bar, address bar) should match, per theme. Keep in step with globals.css. */
export const THEME_COLOR: Record<Theme, string> = { light: "#FDF8E2", dark: "#17161F" };

/** Runs in the head, before anything is drawn. Must stay tiny, dependency-free and never throw. Reading the saved choice and asking the device are separate, so blocked storage still follows the device. */
export const THEME_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}try{if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
