'use client';

import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';

/**
 * A custom hook that persists state in sessionStorage.
 * Useful for maintaining filter state across page navigation.
 * 
 * @param key - The unique storage key for this specific page/component
 * @param defaultValue - The initial value if no stored value is found
 * @returns [state, setState]
 */
export function usePersistentState<T>(
    key: string,
    defaultValue: T
): [T, Dispatch<SetStateAction<T>>] {
    // Determine the storage key (prefixed for safety)
    const storageKey = `ERP_FILTER_${key}`;

    // Initialize state with a lazy loader
    const [state, setState] = useState<T>(() => {
        if (typeof window === 'undefined') return defaultValue;
        
        try {
            const stored = window.sessionStorage.getItem(storageKey);
            if (stored !== null) {
                return JSON.parse(stored) as T;
            }
        } catch (error) {
            console.warn(`Error reading sessionStorage for ${storageKey}:`, error);
        }
        return defaultValue;
    });

    // Update sessionStorage whenever state changes
    useEffect(() => {
        if (typeof window === 'undefined') return;

        try {
            window.sessionStorage.setItem(storageKey, JSON.stringify(state));
        } catch (error) {
            console.warn(`Error writing to sessionStorage for ${storageKey}:`, error);
        }
    }, [storageKey, state]);

    return [state, setState];
}

export default usePersistentState;
