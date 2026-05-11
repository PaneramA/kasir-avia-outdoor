import React from 'react';

const ViewModeToggle = ({
    value,
    onChange,
    gridLabel = 'Kartu Besar',
    listLabel = 'List Kecil',
    containerClassName = '',
    buttonClassName = 'px-3 py-2 text-xs',
}) => {
    const options = [
        { key: 'grid', label: gridLabel },
        { key: 'list', label: listLabel },
    ];

    return (
        <div className={`grid grid-cols-2 rounded-md border border-border bg-sidebar-bg p-1 ${containerClassName}`.trim()}>
            {options.map((option) => {
                const isActive = value === option.key;
                return (
                    <button
                        key={option.key}
                        type="button"
                        aria-pressed={isActive}
                        className={`rounded font-semibold transition ${buttonClassName} ${isActive ? 'bg-accent text-white' : 'text-text-muted hover:text-text-main'}`}
                        onClick={() => onChange(option.key)}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
};

export default ViewModeToggle;
