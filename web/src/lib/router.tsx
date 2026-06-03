import { useEffect, useState } from "react"

// Tiny hash router — landing / demo / docs, no dependency. Hash keeps the Vite
// SPA deploy trivial (no server rewrite needed for static hosting).
export type Route = "/" | "/demo" | "/docs"

function parse(): Route {
  const h = window.location.hash.replace(/^#/, "") || "/"
  if (h.startsWith("/docs")) return "/docs"
  if (h.startsWith("/demo")) return "/demo"
  return "/"
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  return route
}

export function navigate(to: Route) {
  if (parse() === to) {
    window.scrollTo({ top: 0, behavior: "smooth" })
    return
  }
  window.location.hash = to
  window.scrollTo({ top: 0 })
}
