import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Home, LayoutDashboard, Calendar, BarChart3, Search } from 'lucide-react';

// Import Tab components
import Dashboard from './admin/Dashboard';
import EventManager from './admin/EventManager';
import Analytics from './admin/Analytics';
import SEOSettings from './admin/SEOSettings';

const TABS = [
    { id: 'dashboard', label: '總覽', icon: LayoutDashboard },
    { id: 'events', label: '活動管理', icon: Calendar },
    { id: 'analytics', label: '流量分析', icon: BarChart3 },
    { id: 'seo', label: 'SEO 設定', icon: Search },
];

const Admin = () => {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('dashboard');

    const renderTabContent = () => {
        switch (activeTab) {
            case 'dashboard':
                return <Dashboard />;
            case 'events':
                return <EventManager />;
            case 'analytics':
                return <Analytics />;
            case 'seo':
                return <SEOSettings />;
            default:
                return <Dashboard />;
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
            {/* Header */}
            <div style={{ background: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem' }}>活動管理後台</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => navigate('/')}
                        style={{ padding: '0.5rem 1rem', background: '#2a9d8f', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <Home size={16} /> 回首頁
                    </button>
                    <button onClick={signOut} style={{ padding: '0.5rem 1rem', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        登出
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div style={{ background: 'white', borderBottom: '1px solid #e5e5e5', padding: '0 2rem' }}>
                <div style={{ display: 'flex', gap: '0' }}>
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '1rem 1.5rem',
                                background: 'none',
                                border: 'none',
                                borderBottom: activeTab === tab.id ? '3px solid #e63946' : '3px solid transparent',
                                color: activeTab === tab.id ? '#e63946' : '#666',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontWeight: activeTab === tab.id ? '600' : '400',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <tab.icon size={18} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                {renderTabContent()}
            </div>
        </div>
    );
};

export default Admin;
