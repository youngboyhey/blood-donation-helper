import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Calendar, MapPin, TrendingUp, Globe, RefreshCw, Clock, CheckCircle, XCircle } from 'lucide-react';

const CITY_COLORS = ['#e63946', '#2a9d8f', '#e9c46a', '#264653', '#f4a261', '#a8dadc', '#457b9d', '#1d3557'];
const SOURCE_COLORS = { '官網': '#e63946', 'Google圖片': '#2a9d8f', '人工上傳': '#457b9d' };

const Dashboard = () => {
    const [loading, setLoading] = useState(true);
    const [crawlerStatus, setCrawlerStatus] = useState(null);
    const [stats, setStats] = useState({
        total: 0,
        thisWeek: 0,
        cityCount: 0,
        byCity: [],
        weeklyDistribution: [],
        bySource: []
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);

        // Fetch events
        const { data } = await supabase.from('events').select('*');
        const allEvents = data || [];

        // Fetch crawler status
        const { data: crawlerData } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'crawler_status')
            .single();

        if (crawlerData) {
            setCrawlerStatus(crawlerData.value);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const oneWeekLater = new Date(today);
        oneWeekLater.setDate(oneWeekLater.getDate() + 7);

        const total = allEvents.length;
        const thisWeek = allEvents.filter(ev => {
            const evDate = new Date(ev.date);
            return evDate >= today && evDate < oneWeekLater;
        }).length;

        const cityCount = {};
        allEvents.forEach(ev => {
            const city = ev.city || '未知';
            cityCount[city] = (cityCount[city] || 0) + 1;
        });
        const byCity = Object.entries(cityCount)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        const weeklyDistribution = [];
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

        const sourceCount = { '官網': 0, 'Google圖片': 0, '人工上傳': 0 };
        allEvents.forEach(ev => {
            const url = ev.source_url || ev.poster_url || '';
            if (url.includes('blood.org.tw')) {
                sourceCount['官網']++;
            } else if (url.includes('supabase') || url.includes('storage')) {
                sourceCount['人工上傳']++;
            } else {
                sourceCount['Google圖片']++;
            }
        });
        const bySource = Object.entries(sourceCount)
            .map(([name, value]) => ({ name, value }))
            .filter(item => item.value > 0);

        setStats({ total, thisWeek, cityCount: byCity.length, byCity, weeklyDistribution, bySource });
        setLoading(false);
    };

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

    const topSource = stats.bySource.length > 0
        ? stats.bySource.reduce((a, b) => a.value > b.value ? a : b).name
        : '無資料';

    return (
        <div>
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
                <a
                    href="https://github.com/youngboyhey/blood-donation-helper/actions"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        fontSize: '0.85rem',
                        color: '#2563eb',
                        textDecoration: 'none'
                    }}
                >
                    查看 Actions →
                </a>
            </div>

            {/* Stats Cards - 4 Column Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '1.5rem',
                marginBottom: '2rem'
            }}>
                {/* Card 1: Total */}
                <div style={{
                    background: 'linear-gradient(135deg, #e63946 0%, #f4a261 100%)',
                    color: 'white',
                    padding: '1.5rem',
                    borderRadius: '16px',
                    boxShadow: '0 8px 16px rgba(230, 57, 70, 0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <Calendar size={22} />
                        <span style={{ fontSize: '0.95rem', opacity: 0.9, fontWeight: '500' }}>總活動數</span>
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', lineHeight: 1 }}>{stats.total}</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.5rem' }}>所有已收錄活動</div>
                </div>

                {/* Card 2: This Week */}
                <div style={{
                    background: 'linear-gradient(135deg, #2a9d8f 0%, #a8dadc 100%)',
                    color: 'white',
                    padding: '1.5rem',
                    borderRadius: '16px',
                    boxShadow: '0 8px 16px rgba(42, 157, 143, 0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <TrendingUp size={22} />
                        <span style={{ fontSize: '0.95rem', opacity: 0.9, fontWeight: '500' }}>本週活動</span>
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', lineHeight: 1 }}>{stats.thisWeek}</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.5rem' }}>未來 7 天內</div>
                </div>

                {/* Card 3: Cities */}
                <div style={{
                    background: 'linear-gradient(135deg, #457b9d 0%, #1d3557 100%)',
                    color: 'white',
                    padding: '1.5rem',
                    borderRadius: '16px',
                    boxShadow: '0 8px 16px rgba(69, 123, 157, 0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <MapPin size={22} />
                        <span style={{ fontSize: '0.95rem', opacity: 0.9, fontWeight: '500' }}>涵蓋縣市</span>
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', lineHeight: 1 }}>{stats.cityCount}</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.5rem' }}>全台各地活動</div>
                </div>

                {/* Card 4: Data Source */}
                <div style={{
                    background: 'linear-gradient(135deg, #264653 0%, #2a9d8f 100%)',
                    color: 'white',
                    padding: '1.5rem',
                    borderRadius: '16px',
                    boxShadow: '0 8px 16px rgba(38, 70, 83, 0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <Globe size={22} />
                        <span style={{ fontSize: '0.95rem', opacity: 0.9, fontWeight: '500' }}>資料來源</span>
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1.2 }}>{topSource}</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem' }}>
                        {stats.bySource.map(s => `${s.name}: ${s.value}`).join(' / ')}
                    </div>
                </div>
            </div>

            {/* Charts - 3 Column Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '1.5rem'
            }}>
                {/* Weekly Bar Chart */}
                <div style={{
                    background: 'white',
                    padding: '1.5rem',
                    borderRadius: '16px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    border: '1px solid #f0f0f0'
                }}>
                    <h3 style={{ marginBottom: '1rem', color: '#333', fontSize: '1.1rem', fontWeight: '600' }}>
                        📅 未來 7 天活動
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={stats.weeklyDistribution}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#999" />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#999" />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
                            <Bar dataKey="活動數" fill="#e63946" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* City Pie Chart */}
                <div style={{
                    background: 'white',
                    padding: '1.5rem',
                    borderRadius: '16px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    border: '1px solid #f0f0f0'
                }}>
                    <h3 style={{ marginBottom: '1rem', color: '#333', fontSize: '1.1rem', fontWeight: '600' }}>
                        📍 縣市分佈
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie
                                data={stats.byCity.slice(0, 6)}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={90}
                                paddingAngle={2}
                                dataKey="value"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {stats.byCity.slice(0, 6).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={CITY_COLORS[index % CITY_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Source Pie Chart */}
                <div style={{
                    background: 'white',
                    padding: '1.5rem',
                    borderRadius: '16px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    border: '1px solid #f0f0f0'
                }}>
                    <h3 style={{ marginBottom: '1rem', color: '#333', fontSize: '1.1rem', fontWeight: '600' }}>
                        🌐 資料來源
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie
                                data={stats.bySource}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={90}
                                paddingAngle={2}
                                dataKey="value"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {stats.bySource.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={SOURCE_COLORS[entry.name] || CITY_COLORS[index]} />
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
