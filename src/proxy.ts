import { auth } from "@/auth/config";

export default auth((req) => {
  const isAuthed = !!req.auth;
  const isProtected = req.nextUrl.pathname.startsWith("/cellar");
  if (isProtected && !isAuthed) {
    const url = new URL("/login", req.nextUrl.origin);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/cellar/:path*"],
};
