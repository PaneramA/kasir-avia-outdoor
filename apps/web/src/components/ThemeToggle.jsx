import React, { useEffect, useState } from 'react'
import { getTheme, saveTheme } from '../lib/storage'

const ThemeToggle = () => {
    const [theme, setTheme] = useState(getTheme)

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        saveTheme(theme)
    }, [theme])

    const toggleTheme = () => {
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
    }

    const isLight = theme === 'light'

    return (
        <div className="flex items-center gap-3">
            <div
                onClick={toggleTheme}
                className={`relative w-[120px] h-[46px] rounded-full p-1 cursor-pointer transition-all duration-300 overflow-hidden flex items-center
                    ${isLight
                        ? 'bg-[#E4EBEB] shadow-[inset_2px_2px_5px_rgba(0,0,0,0.05),inset_-2px_-2px_5px_rgba(255,255,255,0.8)]'
                        : 'bg-[#141A1A] shadow-[inset_4px_4px_8px_rgba(0,0,0,0.5),inset_-4px_-4px_8px_rgba(255,255,255,0.05)]'
                    }`}
            >
                <div className="absolute w-full h-full flex items-center pointer-events-none z-0 left-0">
                    <span className={`absolute left-3.5 text-[0.7rem] font-bold tracking-wider transition-opacity duration-300 ${isLight ? 'opacity-0' : 'opacity-100 text-[#5C6767]'}`}>
                        DARK<br />MODE
                    </span>
                    <span className={`absolute right-3.5 text-right text-[0.7rem] font-bold tracking-wider transition-opacity duration-300 ${!isLight ? 'opacity-0' : 'opacity-100 text-[#889292]'}`}>
                        LIGHT<br />MODE
                    </span>
                </div>

                <div
                    className={`absolute w-[38px] h-[38px] rounded-full flex items-center justify-center z-10 transition-transform duration-500 ease-in-out
                        ${isLight
                            ? 'translate-x-0 bg-[#F0F4F4] shadow-[2px_2px_5px_rgba(0,0,0,0.05),-2px_-2px_5px_rgba(255,255,255,0.8)] text-[#A0A5A3]'
                            : 'translate-x-[74px] bg-[#2D3A3A] shadow-[4px_4px_8px_rgba(0,0,0,0.4),-4px_-4px_8px_rgba(255,255,255,0.05)] text-[#A0A5A3]'
                        }`}
                >
                    <i className={`fas ${isLight ? 'fa-sun text-[1.1rem]' : 'fa-moon text-[1.1rem]'} transition-all duration-500`}></i>
                </div>
            </div>
        </div>
    )
}

export default ThemeToggle