import { WALKTHROUGH_COOKIE, WALKTHROUGH_PATH, walkthroughSeen } from "@/lib/walkthrough";
import { type NextRequest, NextResponse } from "next/server";

/// First visit: every page except the walkthrough itself goes to `/walkthrough?welcome=1`. The
/// walkthrough writes the cookie, and every later request passes through untouched.
///
/// `api` and `.netlify` are excluded so same-origin API calls keep working; `_next` and any path
/// with a file extension are excluded so assets do not get redirected.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === WALKTHROUGH_PATH) return NextResponse.next();
  if (walkthroughSeen(request.cookies.get(WALKTHROUGH_COOKIE)?.value)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = WALKTHROUGH_PATH;
  url.search = "";
  url.searchParams.set("welcome", "1");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next|\\.netlify|favicon.ico|.*\\..*).*)"],
};
