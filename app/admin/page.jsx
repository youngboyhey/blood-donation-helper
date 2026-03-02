'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { Home, LayoutDashboard, Calendar, BarChart3, Search, LogOut } from 'lucide-react';

// Import Tab components
import Dashboard from './components/Dashboard';
import EventManager from './components/EventManager';
import Analytics from './components/Analytics';
import SEOSettings from './components/SEOSettings';

const TABS = [
    { id: 'dashboard', label: '總覽', icon: LayoutDashboard },
    { id: 'events', label: '活動管理', icon: Calendar },
    { id: 'analytics', label: '流量分析', icon: BarChart3 },
    { id: 'seo', label: 'SEO 設定', icon: Search },
];

export default function AdminPage() {
    const { user, signOut } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        // 未登入則導向登入頁
        if (!user) {
            router.push('/login');
            return;
        }
        setIsMobile(window.innerWidth < 768);
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [user, router]);

    if (!user) return null;

    const renderTabContent = () => {
        const props = { isMobile };
        switch (activeTab) {
            case 'dashboard': return <Dashboard {...props} />;
            case 'events': return <EventManager {...props} />;
            case 'analytics': return <Analytics {...props} />;
            case 'seo': return <SEOSettings {...props} />;
            default: return <Dashboard {...props} />;
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
            {/* Header */}
            <div style={{
                background: 'white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                padding: isMobile ? '1rem' : '1rem 2rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h1 style={{ margin: 0, fontSize: isMobile ? '1.25rem' : '1.5rem' }}>管理後台</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => router.push('/')}
                        style={{
                            padding: isMobile ? '0.5rem' : '0.5rem 1rem',
                            background: '#2a9d8f',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <Home size={16} /> {!isMobile && '回首頁'}
                    </button>
                    <button
                        onClick={signOut}
                        style={{
                            padding: isMobile ? '0.5rem' : '0.5rem 1rem',
                            background: '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <LogOut size={16} /> {!isMobile && '登出'}
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div style={{
                background: 'white',
                borderBottom: '1px solid #e5e5e5',
                padding: isMobile ? '0' : '0 2rem',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
            }}>
                <div style={{ display: 'flex', minWidth: 'min-content' }}>
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: isMobile ? '1rem 1rem' : '1rem 1.5rem',
                                background: 'none',
                                border: 'none',
                                borderBottom: activeTab === tab.id ? '3px solid #e63946' : '3px solid transparent',
                                color: activeTab === tab.id ? '#e63946' : '#666',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontWeight: activeTab === tab.id ? '600' : '400',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.2s ease',
                                fontSize: isMobile ? '0.9rem' : '1rem'
                            }}
                        >
                            <tab.icon size={isMobile ? 16 : 18} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div style={{
                padding: isMobile ? '1rem' : '2rem',
                maxWidth: '1400px',
                margin: '0 auto'
            }}>
                {renderTabContent()}
            </div>
        </div>
    );
}
