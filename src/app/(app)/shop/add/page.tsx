import { redirect } from "next/navigation";
import { shareDraft } from "@/lib/shop";

// Where Android's Share sheet lands when you pick Qwency (see share_target in manifest.ts). Shop apps
// put their title, a sentence and the link in different places, so this finds the link wherever it is,
// keeps the words that aren't the link as the title, and opens the app on Shop with those filled in.
// Nothing is saved here: you still press Add.

type Params = Record<string, string | string[] | undefined>;

export default async function ShareTarget({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return ((Array.isArray(v) ? v[0] : v) ?? "").slice(0, 1500);
  };
  const { title, url } = shareDraft({ title: one("title"), text: one("text"), url: one("url") });
  redirect(`/?${new URLSearchParams({ shop: "1", u: url, t: title }).toString()}`);
}
