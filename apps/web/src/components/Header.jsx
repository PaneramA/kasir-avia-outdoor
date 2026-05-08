import React from 'react';

const Header = ({ title, subtitle, onOpenSidebar }) => {
    return (
        <header className="mb-4 flex flex-col gap-4 py-4 sm:mb-5 sm:py-6 lg:flex-row lg:items-center lg:justify-between lg:py-8">
            <div className="flex items-start gap-3 sm:items-center">
                <button
                    type="button"
                    className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-sidebar-bg text-text-muted transition hover:border-accent hover:text-text-main lg:hidden"
                    onClick={onOpenSidebar}
                    aria-label="Buka menu navigasi"
                >
                    <i className="fas fa-bars"></i>
                </button>
                <div className="flex flex-col">
                    <h1 id="page-title" className="text-[1.3rem] font-bold font-display text-text-main sm:text-[1.6rem] lg:text-[1.8rem]">{title}</h1>
                    <p id="page-subtitle" className="text-[0.82rem] text-text-muted sm:text-[0.9rem]">{subtitle}</p>
                </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-4 lg:gap-5">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[30px] border border-border bg-sidebar-bg px-4 py-[10px] lg:w-[320px] xl:w-[350px]">
                    <i className="fas fa-search text-text-muted"></i>
                    <input className="bg-transparent border-none outline-none text-text-main w-full text-[0.9rem]" type="text" placeholder="Cari transaksi atau barang..." />
                </div>
                <button className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-sidebar-bg text-text-muted transition-all hover:bg-white/5">
                    <i className="fas fa-bell"></i>
                    <span className="absolute -top-1 -right-1 bg-[#e74c3c] text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-sidebar-bg">3</span>
                </button>
            </div>
        </header>
    );
};

export default Header;
