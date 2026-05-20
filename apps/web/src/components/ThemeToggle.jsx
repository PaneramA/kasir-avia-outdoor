import React, { useEffect } from 'react'
import { saveTheme } from '../lib/storage'

const ThemeToggle = () => {
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', 'light')
        saveTheme('light')
    }, [])

    return (
        <div className="flex items-center gap-2 rounded-full border border-border bg-bg-main px-3 py-2 text-[0.75rem] font-semibold text-text-muted">
            <i className="fas fa-sun text-accent"></i>
            Mode Terang Aktif
        </div>
    )
}

export default ThemeToggle
