import { TodayShell } from "@/components/shell";

// Shown while the page itself is being prepared (checking who you are): the same shape the app
// shows while your days arrive, so one never replaces the other with a different picture.
export default function Loading() {
  return <TodayShell />;
}
