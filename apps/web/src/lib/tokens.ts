/**
 * UI Design Tokens
 * 
 * Centralized constants for consistent UI across the application.
 * Use these tokens instead of hardcoded values to prevent visual inconsistency.
 */

/**
 * Z-Index hierarchy (enforceable — prevents header-over-overlay bugs).
 * Use Z.* everywhere; never hardcode z-50 or arbitrary z-index.
 */
export const Z = {
    header: "z-30",
    popover: "z-[100]",
    overlay: "z-[200]",
    overlayContent: "z-[201]",
} as const;

export const UI_CONSTANTS = {
    /**
     * Standard control height for all interactive elements
     * Used for: buttons, inputs, selects, tabs, dropdowns
     */
    CONTROL_HEIGHT: 'h-9' as const,
    CONTROL_HEIGHT_PX: 36,
    
    /**
     * Toolbar height for consistent header/toolbar areas
     */
    TOOLBAR_HEIGHT: 'h-14' as const,
    TOOLBAR_HEIGHT_PX: 56,
    
    /**
     * Spacing scale for consistent gaps and padding
     */
    SPACING: {
        controlGap: 'gap-2' as const,
        toolbarGap: 'gap-3' as const,
        sectionGap: 'space-y-4' as const,
        sectionGapLarge: 'space-y-6' as const,
        containerPadding: 'p-4' as const,
        toolbarPadding: 'px-4' as const,
    },
} as const;

/**
 * Usage:
 * 
 * import { UI_CONSTANTS, Z } from '@/lib/tokens';
 * 
 * <Input className={UI_CONSTANTS.CONTROL_HEIGHT} />
 * <header className={Z.header}>...</header>
 * <SheetOverlay className={Z.overlay} />
 */
