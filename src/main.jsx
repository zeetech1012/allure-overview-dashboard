import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import AllureOverview from './AllureOverview.jsx'
import { CONFIG } from './allure-data.js'

// Tweaks from the design (defaultTheme / defaultView / defaultCardStyle / passThreshold / accent)
// are surfaced as component props with the same defaults.
createRoot(document.getElementById('root')).render(
  <AllureOverview
    defaultTheme="auto"
    defaultView="cards"
    defaultCardStyle="detailed"
    passThreshold={CONFIG.PASS_THRESHOLD}
    accent="#2f81f7"
  />,
)
