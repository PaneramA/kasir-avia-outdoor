import React, { useEffect } from 'react'
import { saveTheme } from '../lib/storage'

const ThemeToggle = () => {
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        try {
            saveTheme(theme)
        } catch {
            // ignore storage write errors
        }
    }, [theme])

    const isLight = theme === 'light'

    return (
        <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-border bg-bg-main px-3 py-2 text-[0.75rem] font-semibold text-text-muted transition hover:border-accent"
            onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            aria-label="Ganti mode tema"
        >
            <i className={`fas ${isLight ? 'fa-sun text-accent' : 'fa-moon text-accent'}`}></i>
            {isLight ? 'Mode Terang' : 'Mode Gelap'}
        </button>
    )
}

export default ThemeToggle
