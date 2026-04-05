'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface Employee {
    userid?: number;
    employeeid?: number;
    firstname?: string;
    lastname?: string;
    fullname?: string;
    role?: string;
}

export interface UserFilterProps {
    onUserChange: (userId: number | null) => void;
    className?: string;
    label?: string;
    excludeSystemUsers?: boolean;
}

export function UserFilter({ onUserChange, className = '', label = 'Vendeur', excludeSystemUsers = false }: UserFilterProps) {
    const [users, setUsers] = useState<Employee[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if current user can filter by user
        // ADMIN, MANAGER, and SALES_WHOLESALE can see all orders
        const role = localStorage.getItem('user_role');
        const canFilterByUser = role === 'ADMIN' || role === 'MANAGER' || role === 'SALES_WHOLESALE';
        setIsAdmin(canFilterByUser);

        if (canFilterByUser) {
            loadUsers();
        } else {
            setLoading(false);
        }
    }, []);

    const loadUsers = async () => {
        try {
            // Use the new salespersons endpoint accessible by ADMIN, MANAGER, SALES_WHOLESALE
            const res = await api.getSalespersons();
            console.log('Salespersons API response:', res); // Debug log
            if (res.success && res.data) {
                // Include all users (no role filtering - all are relevant for order filtering)
                setUsers(res.data as any[]);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (value: string) => {
        if (value === '') {
            setSelectedUserId('');
            onUserChange(null);
        } else {
            const userId = Number(value);
            setSelectedUserId(userId);
            onUserChange(userId);
        }
    };

    // Only render for admin/manager users
    if (!isAdmin || loading) {
        return null;
    }

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <label className="text-xs font-medium text-slate-500 whitespace-nowrap">
                👤 {label}:
            </label>
            <select
                value={selectedUserId}
                onChange={(e) => handleChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 min-w-[150px]"
            >
                <option value="">Tous les utilisateurs</option>
                {users.map((u: any) => {
                    let displayName = u.username || u.fullname || `Utilisateur #${u.userid}`;
                    const setDisplayName = displayName.toLowerCase();

                    // Friendly names for system accounts
                    if (setDisplayName === 'wholesale') displayName = 'Gros (System)';
                    if (setDisplayName === 'retail') displayName = 'Détail (System)';

                    // Skip system users if requested
                    if (excludeSystemUsers && (setDisplayName === 'wholesale' || setDisplayName === 'retail')) {
                        return null;
                    }

                    return (
                        <option key={u.userid} value={u.userid}>
                            {displayName}
                        </option>
                    );
                })}
            </select>
        </div>
    );
}

export default UserFilter;
