"use client";

import { useGlobalEscapeKey } from "@/hooks/useGlobalEscapeKey";

/**
 * Component that provides global keyboard shortcuts
 * Add this to the root layout to enable shortcuts app-wide
 */
export default function GlobalKeyboardShortcuts() {
    // Enable ESC key to go back
    useGlobalEscapeKey();

    // This component doesn't render anything
    return null;
}
