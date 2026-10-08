import { fieldVisible, formatAmount, isSlip, optionLabelOf, type Data, type FieldSpec, type SectionSpec } from "./spec";

// What a section on Today needs to say about itself once it has been answered: is it finished (so it can fold into
// one line and get out of the way), and what is that one line. Pure, so it can be tested without drawing anything.

const answered = (v: Data[string] | undefined) => v !== undefined && (!Array.isArray(v) || v.length > 0);

/**
 * A reason asked because an answer went the wrong way ("What stopped you?" after Gym: Skipped) is asked once and never
 * holds the section open: it is optional, the same as everywhere else in the app.
 */
function optionalReason(section: SectionSpec, f: FieldSpec, data: Data): boolean {
  const c = f.showIf;
  if (!c || !("equals" in c)) return false;
  const parent = section.fields.find((p) => p.key === c.field);
  return parent !== undefined && isSlip(parent, data[parent.key], true);
}

/**
 * Is there nothing left waiting for an answer? Every question that is showing and has to be answered has been, a counter
 * has reached its goal (on a day that is over there is nothing left to reach), and at least one thing is answered. Picks
 * you may make or not (which muscles, what you spent on) never keep it open. Work: "Where?" is answered but "How
 * focused?" is showing and isn't, so Work is still open. Water at 4 of 8 is still open.
 */
export function sectionComplete(section: SectionSpec, data: Data, dayOver: boolean): boolean {
  const shown = section.fields.filter((f) => fieldVisible(f, data));
  if (!shown.some((f) => answered(data[f.key]))) return false;
  return shown
    .filter((f) => f.kind !== "multi" && !optionalReason(section, f, data))
    .every((f) => {
      const v = data[f.key];
      if (!answered(v)) return false;
      return f.kind === "counter" ? dayOver || (typeof v === "number" && v >= f.goal) : true;
    });
}

/** The answers in a few words, for the one line a finished section folds into: "6–7h", "4 of 8 glasses · Face wash AM". */
export function sectionSummary(section: SectionSpec, data: Data): string {
  const parts: string[] = [];
  for (const f of section.fields) {
    if (!fieldVisible(f, data)) continue;
    const v = data[f.key];
    if (!answered(v)) continue;
    if (f.kind === "single" && typeof v === "string") parts.push(optionLabelOf(f, v));
    else if (f.kind === "multi" && Array.isArray(v)) {
      const labels = v.map((id) => optionLabelOf(f, id));
      parts.push(labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(", "));
    } else if (f.kind === "counter" && typeof v === "number") parts.push(`${v} of ${f.goal} ${f.unit}`);
    else if (f.kind === "amount" && typeof v === "number") parts.push(formatAmount(f, v));
  }
  return parts.join(" · ");
}

/** Did an answer land on the wrong side of its line (so the folded line says so)? */
export const sectionMissed = (section: SectionSpec, data: Data, dayOver: boolean): boolean =>
  section.fields.some((f) => fieldVisible(f, data) && isSlip(f, data[f.key], dayOver));
