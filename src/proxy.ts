import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

const clerk = clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

// TEMPORARY (visual/perf checks, removed with src/app/bench)
export const proxy = (req: NextRequest, ev: NextFetchEvent) =>
  process.env.QWENCY_BENCH === "1" && req.nextUrl.pathname.startsWith("/bench") ? NextResponse.next() : clerk(req, ev);

export const config = {
  matcher: [
    // Skip Next internals, Vercel's own endpoints (Speed Insights) and static files
    "/((?!_next|_vercel|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    // On a *.vercel.app domain Clerk serves its script and API through /__clerk, and this middleware is what forwards it
    "/__clerk/(.*)",
  ],
};
