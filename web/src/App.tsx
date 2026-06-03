import { MotionConfig } from "motion/react"
import Starfield from "./components/Starfield"
import { Nav } from "./components/Nav"
import { Footer } from "./components/Footer"
import Landing from "./pages/Landing"
import Demo from "./pages/Demo"
import Docs from "./pages/Docs"
import { useRoute } from "./lib/router"

export default function App() {
  const route = useRoute()
  return (
    // reducedMotion="user" makes every Framer animation honor the OS setting.
    <MotionConfig reducedMotion="user">
      <Starfield />
      <Nav route={route} />
      {route === "/demo" ? <Demo /> : route === "/docs" ? <Docs /> : <Landing />}
      <Footer />
    </MotionConfig>
  )
}
