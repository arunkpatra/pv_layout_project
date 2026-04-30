import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"])
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"])

export const proxy = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()

  // Authenticated users visiting sign-in/sign-up have nowhere to go but dashboard
  if (userId && isAuthRoute(req)) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  // Protect dashboard routes for unauthenticated users
  if (isProtectedRoute(req)) {
    await auth.protect({ unauthenticatedUrl: new URL("/sign-in", req.url).toString() })
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}
