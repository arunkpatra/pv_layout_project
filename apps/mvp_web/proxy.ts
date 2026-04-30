import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"])
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"])

export const proxy = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()

  // Authenticated users visiting sign-in/sign-up redirect to dashboard
  if (userId && isAuthRoute(req)) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  // Protect dashboard routes — redirect to sign-in with original URL preserved
  if (isProtectedRoute(req) && !userId) {
    const signInUrl = new URL("/sign-in", req.url)
    signInUrl.searchParams.set(
      "redirect_url",
      req.nextUrl.pathname + req.nextUrl.search,
    )
    return NextResponse.redirect(signInUrl)
  }
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
