import React from "react"
import ReactDOM from "react-dom/client"
import { ThemeProvider, TooltipProvider } from "@solarlayout/ui"
import { App } from "./App"
import "./main.css"

const rootEl = document.getElementById("root")
if (!rootEl) {
  throw new Error("root element not found")
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>
)
