"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Global hook that listens for the ESC key and navigates back
 * Ignores ESC when modals, dropdowns, or input fields are focused
 */
export function useGlobalEscapeKey() {
    const router = useRouter();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Only handle Escape key
            if (event.key !== "Escape") return;

            // Get the active element
            const activeElement = document.activeElement;

            // Don't navigate if user is typing in an input, textarea, or select
            if (
                activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement instanceof HTMLSelectElement
            ) {
                return;
            }

            // Don't navigate if a modal or dialog is open (check for common modal indicators)
            const hasOpenModal =
                document.querySelector('[role="dialog"]') ||
                document.querySelector('[role="alertdialog"]') ||
                document.querySelector(".modal-open") ||
                document.querySelector('[data-modal="true"]');

            if (hasOpenModal) {
                return;
            }

            // Don't navigate if a dropdown or popover is open
            const hasOpenDropdown =
                document.querySelector('[data-state="open"]') ||
                document.querySelector(".dropdown-open");

            if (hasOpenDropdown) {
                return;
            }

            // Prevent default behavior and navigate back
            event.preventDefault();
            router.back();
        };

        // Add event listener
        window.addEventListener("keydown", handleKeyDown);

        // Cleanup
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [router]);
}
