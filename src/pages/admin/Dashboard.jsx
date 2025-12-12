import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Calendar, MapPin, TrendingUp, Globe, RefreshCw, Clock, CheckCircle, XCircle } from 'lucide-react';

const CITY_COLORS = ['#e63946', '#2a9d8f', '#e9c46a', '#264653', '#f4a261', '#a8dadc', '#457b9d', '#1d3557'];
const SOURCE_COLORS = { '官網': '#e63946', 'PTT': '#1e40af', '人工上傳': '#457b9d', '其他': '#9ca3af' };

const Dashboard = () => {
    // State for time range
    const [statsRange, setStatsRange] = useState('week'); // 'week' | 'all'
    const [loading, setLoading] = useState(true);
    const [crawlerStatus, setCrawlerStatus] = useState(null);
    const [stats, setStats] = useState({
        total: 0,
        cityCount: 0,
        byCity: [],
        weeklyDistribution: [],
        bySource: [],
        dateLabel: "未來 7 天"
    });

    useEffect(() => {
        fetchData();
    }, [statsRange]); // Re-calculate when range changes

    const fetchData = async () => {
        setLoading(true);

        const { data } = await supabase.from('events').select('*');
        const allEvents = data || [];

        // Fetch crawler status
        const { data: crawlerData } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'crawler_status')
            .single();

        if (crawlerData) setCrawlerStatus(crawlerData.value);

        // Date Filtering Logic
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let filteredEvents = allEvents;
        let dateLabel = "所有時間";

        if (statsRange === 'week') {
            const oneWeekLater = new Date(today);
            oneWeekLater.setDate(oneWeekLater.getDate() + 7);
            filteredEvents = allEvents.filter(ev => {
                const evDate = new Date(ev.date);
                return evDate >= today && evDate < oneWeekLater;
            });
            dateLabel = "未來 7 天";
        } else {
            // For 'all', we include everything currently in DB
            filteredEvents = allEvents;
        }

        const total = filteredEvents.length;

        // City Stats
        const cityCount = {};
        filteredEvents.forEach(ev => {
            const city = ev.city || '未知';
            cityCount[city] = (cityCount[city] || 0) + 1;
        });
        const byCity = Object.entries(cityCount)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        // Source Stats
        const sourceCount = { '官網': 0, 'PTT': 0, '人工上傳': 0, '其他': 0 };
        filteredEvents.forEach(ev => {
            const url = ev.source_url || ev.poster_url || '';
            const tag = ev.tags || [];

            if (url.includes('blood.org.tw')) {
                sourceCount['官網']++;
            } else if (url.includes('ptt.cc')) {
                sourceCount['PTT']++;
            } else if (tag.includes('手動上傳')) { // Check tag first for manual upload (priority over url)
                sourceCount['人工上傳']++;
            } else {
                sourceCount['其他']++;
            }
        });

        // Remove zero counts for cleaner chart
        const bySource = Object.entries(sourceCount)
            .map(([name, value]) => ({ name, value }))
            .filter(item => item.value > 0);

        // Daily Distribution
        const weeklyDistribution = [];
        if (statsRange === 'week') {
            for (let i = 0; i < 7; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() + i);
                const dateStr = date.toISOString().split('T')[0];
                const dayName = date.toLocaleDateString('zh-TW', { weekday: 'short' });
                const count = allEvents.filter(ev => ev.date === dateStr).length; // Check against ALL events for accuracy on specific day
                weeklyDistribution.push({
                    date: `${date.getMonth() + 1}/${date.getDate()} ${dayName}`,
                    活動數: count
                });
            }
        } else {
            // Let's make the Bar Chart follow the range logic but restrict 'all' to something readable.
            // For simplicity in this iteration, keep displaying upcoming 7 days trend even in 'all' view, or top 7 days?
            // Given the UI label says "未來 7 天趨勢" (Future 7 Days Trend) in the chart component below, 
            // we should stick to generating 7 days data.
            for (let i = 0; i < 7; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() + i);
                const dateStr = date.toISOString().split('T')[0];
                const dayName = date.toLocaleDateString('zh-TW', { weekday: 'short' });
                const count = allEvents.filter(ev => ev.date === dateStr).length;
                weeklyDistribution.push({
                    date: `${date.getMonth() + 1}/${date.getDate()} ${dayName}`,
                    活動數: count
                });
            }
        }

        setStats({ total, cityCount: byCity.length, byCity, weeklyDistribution, bySource, dateLabel });
        setLoading(false);
    };

    // Helper for date formatting
    const formatDate = (isoString) => {
        if (!isoString) return '尚未執行';
        const date = new Date(isoString);
        return date.toLocaleString('zh-TW', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
                <RefreshCw size={32} className="animate-spin" style={{ color: '#e63946' }} />
                <span style={{ marginLeft: '1rem', fontSize: '1.2rem', color: '#666' }}>載入中...</span>
            </div>
        );
    }

    // Derived value for top source
    const topSource = stats.bySource.length > 0 ? stats.bySource.reduce((a, b) => a.value > b.value ? a : b).name : '無';

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem' }}>
            {/* Header with Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0, color: '#1f2937' }}>營運總覽</h2>
                <div style={{ display: 'flex', background: '#f3f4f6', padding: '4px', borderRadius: '8px' }}>
                    <button
                        onClick={() => setStatsRange('week')}
                        style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: statsRange === 'week' ? 'white' : 'transparent', color: statsRange === 'week' ? '#e63946' : '#6b7280', boxShadow: statsRange === 'week' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', fontWeight: '500' }}
                    >
                        未來 7 天
                    </button>
                    <button
                        onClick={() => setStatsRange('all')}
                        style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: statsRange === 'all' ? 'white' : 'transparent', color: statsRange === 'all' ? '#e63946' : '#6b7280', boxShadow: statsRange === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', fontWeight: '500' }}
                    >
                        全部活動
                    </button>
                </div>
            </div>

            {/* Crawler Status Banner */}
            <div style={{
                background: crawlerStatus?.status === 'success' ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : '#fef3c7',
                border: `1px solid ${crawlerStatus?.status === 'success' ? '#86efac' : '#fcd34d'}`,
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {crawlerStatus?.status === 'success' ? (
                        <CheckCircle size={24} color="#22c55e" />
                    ) : (
                        <Clock size={24} color="#f59e0b" />
                    )}
                    <div>
                        <div style={{ fontWeight: '600', color: '#333' }}>
                            🕷️ 爬蟲狀態：{crawlerStatus ? '上次執行成功' : '尚未執行'}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '2px' }}>
                            {crawlerStatus ? (
                                <>
                                    更新時間：{formatDate(crawlerStatus.last_run)} ｜
                                    新增 {crawlerStatus.inserted || 0} 筆 ｜
                                    更新 {crawlerStatus.updated || 0} 筆
                                </>
                            ) : (
                                '等待第一次爬蟲執行...'
                            )}
                        </div>
                    </div>
                </div>
                <a href="https://github.com/youngboyhey/blood-donation-helper/actions" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem', color: '#2563eb', textDecoration: 'none' }}>查看 Actions →</a>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ background: 'linear-gradient(135deg, #e63946 0%, #f4a261 100%)', color: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(230, 57, 70, 0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <Calendar size={20} /> <span style={{ opacity: 0.9 }}>活動總數</span>
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{stats.total}</div>
                    <small style={{ opacity: 0.8 }}>範圍：{stats.dateLabel}</small>
                </div>

                <div style={{ background: 'linear-gradient(135deg, #2a9d8f 0%, #48cae4 100%)', color: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(42, 157, 143, 0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <MapPin size={20} /> <span style={{ opacity: 0.9 }}>涵蓋縣市</span>
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{stats.cityCount}</div>
                    <small style={{ opacity: 0.8 }}>{stats.byCity.slice(0, 3).map(c => c.name).join(' ')}...</small>
                </div>

                <div style={{ background: 'linear-gradient(135deg, #264653 0%, #2a9d8f 100%)', color: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 12px rgba(38, 70, 83, 0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <Globe size={20} /> <span style={{ opacity: 0.9 }}>主要來源</span>
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topSource}</div>
                    <small style={{ opacity: 0.8 }}>{stats.bySource.map(s => `${s.name} ${Math.round(s.value / stats.total * 100)}%`).join(' / ')}</small>
                </div>
            </div>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                {/* Bar Chart */}
                <div style={{ background: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ margin: '0 0 1rem 0' }}>未來 7 天趨勢</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={stats.weeklyDistribution}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="活動數" fill="#e63946" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* City Pie Chart */}
                <div style={{ background: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ margin: '0 0 1rem 0' }}>縣市分佈 ({stats.dateLabel})</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie data={stats.byCity.slice(0, 6)} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                {stats.byCity.slice(0, 6).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={CITY_COLORS[index % CITY_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Source Pie Chart */}
                <div style={{ background: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ margin: '0 0 1rem 0' }}>資料來源佔比 ({stats.dateLabel})</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie data={stats.bySource} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                {stats.bySource.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={SOURCE_COLORS[entry.name] || '#999'} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
