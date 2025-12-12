import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { analyzeImage } from '../../utils/ai';
import { Trash2, Save, X, Play } from 'lucide-react';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// Geocoding 函式 - 將地址轉換為經緯度
async function geocodeAddress(city, district, location) {
    if (!GOOGLE_MAPS_API_KEY) {
        console.log('[Geocode] 未設定 GOOGLE_MAPS_API_KEY，跳過經緯度轉換');
        return null;
    }

    const parts = [];
    if (city) parts.push(city);
    if (district) parts.push(district);
    if (location) parts.push(location);
    const fullAddress = parts.join('');

    if (!fullAddress) return null;

    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW&region=tw`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.results.length > 0) {
            const coords = data.results[0].geometry.location;
            console.log(`[Geocode] ${fullAddress} -> ${coords.lat}, ${coords.lng}`);
            return {
                latitude: coords.lat,
                longitude: coords.lng
            };
        } else {
            console.log(`[Geocode] 無法取得座標: ${data.status}`);
            return null;
        }
    } catch (error) {
        console.error(`[Geocode] 請求失敗: ${error.message}`);
        return null;
    }
}

const DashboardStats = ({ events, range }) => {
    // 統計邏輯
    const stats = React.useMemo(() => {
        const today = new Date();
        const endRange = new Date(today);
        endRange.setDate(today.getDate() + (range === 'week' ? 7 : 365));

        const filtered = events.filter(e => {
            const d = new Date(e.date);
            return d >= today && d <= endRange;
        });

        // 來源統計
        const sourceStats = {
            web: filtered.filter(e => e.source_url?.includes('blood.org.tw')).length,
            ptt: filtered.filter(e => e.source_url?.includes('ptt.cc')).length,
            upload: filtered.filter(e => e.tags?.includes('手動上傳')).length
        };
        // 其他歸類為 Google/AI
        const googleCount = filtered.length - sourceStats.web - sourceStats.ptt - sourceStats.upload;

        // 縣市統計
        const cityStats = {};
        filtered.forEach(e => {
            if (!e.city) return;
            cityStats[e.city] = (cityStats[e.city] || 0) + 1;
        });

        return {
            total: filtered.length,
            sources: { ...sourceStats, google: googleCount },
            cityStats,
            cities: Object.keys(cityStats).length
        };
    }, [events, range]);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ background: '#f87171', padding: '1.5rem', borderRadius: '12px', color: 'white' }}>
                <h3>總活動數 ({range === 'week' ? '7天' : '全部'})</h3>
                <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>{stats.total}</div>
                <small>來源: 官網 {stats.sources.web} / PTT {stats.sources.ptt} / 其他 {stats.sources.google}</small>
            </div>
            <div style={{ background: '#2a9d8f', padding: '1.5rem', borderRadius: '12px', color: 'white' }}>
                <h3>縣市覆蓋</h3>
                <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>{stats.cities}</div>
                <small>涵蓋 {stats.cities} 個縣市</small>
            </div>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #eee', gridColumn: 'span 2' }}>
                <h3>縣市分佈 ({range === 'week' ? '7天' : '全部'})</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {Object.entries(stats.cityStats)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 8)
                        .map(([city, count]) => (
                            <span key={city} style={{ background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.9rem' }}>
                                {city}: {count}
                            </span>
                        ))}
                </div>
            </div>
        </div>
    );
};

// 手機版活動卡片
const EventCard = ({ event, onDelete }) => (
    <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', gap: '1rem' }}>
        <div style={{ width: '80px', height: '100px', flexShrink: 0, background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
            {event.poster_url ? (
                <img src={event.poster_url} alt="poster" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>無圖</div>
            )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.title}</h4>
                <button onClick={() => onDelete(event.id)} style={{ color: '#ef4444', background: 'none', border: 'none', padding: 0 }}>
                    <Trash2 size={18} />
                </button>
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>📅 {event.date} {event.time}</p>
            <p style={{ margin: '0.25rem 0', fontSize: '0.9rem', color: '#4b5563' }}>📍 {event.city} {event.district}</p>
            {event.gift?.name && (
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#e63946' }}>🎁 {event.gift.name}</p>
            )}
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.25rem' }}>
                {event.source_url?.includes('blood.org.tw') && <span style={{ fontSize: '0.7rem', background: '#d1fae5', color: '#065f46', padding: '2px 4px', borderRadius: '2px' }}>官網</span>}
                {event.source_url?.includes('ptt.cc') && <span style={{ fontSize: '0.7rem', background: '#dbeafe', color: '#1e40af', padding: '2px 4px', borderRadius: '2px' }}>PTT</span>}
            </div>
        </div>
    </div>
);

const EventManager = () => {
    // ... (Keep existing state)
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [scannedEvents, setScannedEvents] = useState([]);
    const [showScanner, setShowScanner] = useState(false);
    const [expandedImage, setExpandedImage] = useState(null);
    const [customApiKey, setCustomApiKey] = useState("");
    const [pendingImageUrl, setPendingImageUrl] = useState(null);
    const [pendingFileName, setPendingFileName] = useState("");

    // New State for Dashboard
    const [statsRange, setStatsRange] = useState('week'); // 'week' or 'all'
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        fetchEvents();
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // ... (Keep existing fetchEvents, handleDelete, handleFileUpload, handleStartAnalysis, etc.)
    const fetchEvents = async () => {
        setLoading(true);
        const { data } = await supabase.from('events')
            .select('*')
            .order('date', { ascending: true });
        setEvents(data || []);
        setLoading(false);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('確定要刪除此活動嗎？')) return;
        const { error } = await supabase.from('events').delete().eq('id', id);
        if (error) alert('刪除失敗: ' + error.message);
        else fetchEvents();
    };

    const handleFileUpload = async (e) => {
        // ... (Same as original)
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        setStatusMessage("正在上傳圖片至 Supabase...");
        try {
            const arrayBuffer = await file.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
            const finalExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg';
            const fileName = `${hashHex.substring(0, 32)}.${finalExt}`;

            const { data: existingUrl } = supabase.storage.from('posters').getPublicUrl(fileName);
            const { error } = await supabase.storage.from('posters').upload(fileName, file, { upsert: false });

            let publicUrl;
            if (error && error.message.includes('already exists')) {
                publicUrl = existingUrl.publicUrl;
            } else if (error) throw error;
            else {
                const { data: { publicUrl: newUrl } } = supabase.storage.from('posters').getPublicUrl(fileName);
                publicUrl = newUrl;
            }
            setUploading(false);
            setStatusMessage("");
            setPendingImageUrl(publicUrl);
            setPendingFileName(file.name);
        } catch (error) {
            console.error('Upload failed:', error);
            alert('上傳失敗: ' + error.message);
            setUploading(false);
            setStatusMessage("");
        }
    };

    const handleStartAnalysis = async () => {
        // ... (Same as original)
        if (!pendingImageUrl) return;
        setAnalyzing(true);
        setStatusMessage("開始 AI 分析...");
        try {
            const apiKeyToUse = customApiKey.trim() || null;
            const aiResults = await analyzeImage(pendingImageUrl, (msg) => setStatusMessage(msg), apiKeyToUse);
            setAnalyzing(false);
            setStatusMessage("");
            if (aiResults && aiResults.length > 0) {
                const candidates = aiResults.map(ev => ({ ...ev, poster_url: pendingImageUrl }));
                setScannedEvents(candidates);
                setShowScanner(true);
            } else {
                alert("AI 無法辨識此圖片，請手動輸入或重試。");
            }
            setPendingImageUrl(null);
            setPendingFileName("");
        } catch (error) {
            console.error('Analysis failed:', error);
            alert('分析失敗: ' + error.message);
            setStatusMessage("");
            setAnalyzing(false);
        }
    };

    const handleCancelPending = () => {
        setPendingImageUrl(null);
        setPendingFileName("");
        setCustomApiKey("");
    };

    const handleSaveCandidate = async (candidate, index) => {
        // ... (Same code logic)
        const coords = await geocodeAddress(candidate.city, candidate.district, candidate.location);
        const newEvent = {
            title: candidate.title,
            date: candidate.date,
            time: candidate.time,
            location: candidate.location,
            city: candidate.city,
            district: candidate.district,
            organizer: candidate.organizer,
            gift: candidate.gift,
            tags: candidate.tags || ['手動上傳'],
            poster_url: candidate.poster_url,
            original_image_url: candidate.poster_url,
            source_url: candidate.poster_url,
            latitude: coords?.latitude || null,
            longitude: coords?.longitude || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data: posterDuplicates } = await supabase.from('events').select('id, title, date, location').eq('poster_url', candidate.poster_url);
        if (posterDuplicates && posterDuplicates.length > 0) {
            if (!window.confirm('發現相同圖片的活動已存在，確定要覆蓋？')) return;
            for (const dup of posterDuplicates) await supabase.from('events').delete().eq('id', dup.id);
        }

        const { data: existingEvents } = await supabase.from('events').select('id, title, date, location').eq('date', candidate.date);
        const duplicates = existingEvents?.filter(ev => {
            const locA = (ev.location || '').toLowerCase().replace(/\s/g, '');
            const locB = (candidate.location || '').toLowerCase().replace(/\s/g, '');
            return locA.includes(locB) || locB.includes(locA) || locA === locB;
        }) || [];

        if (duplicates.length > 0) {
            if (!window.confirm('發現可能重複的活動（日期+地點），確定要覆蓋？')) return;
            for (const dup of duplicates) await supabase.from('events').delete().eq('id', dup.id);
        }

        const { error } = await supabase.from('events').insert([newEvent]);
        if (error) alert('儲存失敗: ' + error.message);
        else {
            const newCandidates = [...scannedEvents];
            newCandidates.splice(index, 1);
            setScannedEvents(newCandidates);
            fetchEvents();
            if (newCandidates.length === 0) setShowScanner(false);
        }
    };

    const handleDiscardCandidate = (index) => {
        const newCandidates = [...scannedEvents];
        newCandidates.splice(index, 1);
        setScannedEvents(newCandidates);
        if (newCandidates.length === 0) setShowScanner(false);
    };


    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '1rem' : '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ margin: 0 }}>活動管理後台</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => setStatsRange('week')}
                        style={{ padding: '0.5rem 1rem', borderRadius: '20px', border: 'none', background: statsRange === 'week' ? '#2563eb' : '#e5e7eb', color: statsRange === 'week' ? 'white' : '#374151', cursor: 'pointer' }}
                    >
                        未來7天
                    </button>
                    <button
                        onClick={() => setStatsRange('all')}
                        style={{ padding: '0.5rem 1rem', borderRadius: '20px', border: 'none', background: statsRange === 'all' ? '#2563eb' : '#e5e7eb', color: statsRange === 'all' ? 'white' : '#374151', cursor: 'pointer' }}
                    >
                        全部活動
                    </button>
                </div>
            </div>

            <DashboardStats events={events} range={statsRange} />

            {/* Upload Section */}
            <div style={{ marginBottom: '2rem', padding: '1.5rem', border: '2px dashed #ccc', borderRadius: '12px', textAlign: 'center', background: 'white' }}>
                <h3>上傳活動海報</h3>
                <p style={{ color: '#666' }}>自動分析海報內容並建立活動（支援自動去重）</p>
                {/* ... (Keep existing upload inputs) ... */}
                <div style={{ marginBottom: '1rem' }}>
                    <input
                        type="password"
                        placeholder="輸入自訂 Gemini API Key（選填）"
                        value={customApiKey}
                        onChange={(e) => setCustomApiKey(e.target.value)}
                        style={{ padding: '0.5rem', width: '300px', marginRight: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                </div>
                <input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploading || analyzing || pendingImageUrl} />

                {uploading && <div style={{ marginTop: '1rem', color: '#007bff' }}>⏳ 上傳中...</div>}

                {pendingImageUrl && !analyzing && (
                    <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #0284c7', maxWidth: '400px', margin: '1rem auto' }}>
                        <p style={{ marginBottom: '0.5rem' }}>✅ 已上傳: <strong>{pendingFileName}</strong></p>
                        <img src={pendingImageUrl} alt="preview" style={{ maxHeight: '150px', borderRadius: '4px', marginBottom: '1rem' }} />
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button onClick={handleStartAnalysis} style={{ padding: '0.5rem 1rem', background: '#e63946', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Play size={16} /> 開始分析
                            </button>
                            <button onClick={handleCancelPending} style={{ padding: '0.5rem 1rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                取消
                            </button>
                        </div>
                    </div>
                )}
                {analyzing && <div style={{ marginTop: '1rem', color: '#007bff' }}>🤖 {statusMessage}</div>}
            </div>

            {/* AI Results */}
            {showScanner && (
                <div style={{ marginBottom: '2rem' }}>
                    <h3>AI 辨識結果 ({scannedEvents.length})</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                        {/* ... (Keep existing AI result cards, just style tweaks if needed) ... */}
                        {scannedEvents.map((ev, idx) => (
                            <div key={idx} style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                <img src={ev.poster_url} alt="preview" style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px', marginBottom: '0.5rem' }} />
                                {/* ... inputs ... */}
                                <input value={ev.title} onChange={e => {
                                    const newEvs = [...scannedEvents];
                                    newEvs[idx].title = e.target.value;
                                    setScannedEvents(newEvs);
                                }} style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }} placeholder="活動標題" />

                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <input type="date" value={ev.date} onChange={e => {
                                        const newEvs = [...scannedEvents];
                                        newEvs[idx].date = e.target.value;
                                        setScannedEvents(newEvs);
                                    }} style={{ flex: 1, padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }} />
                                    <input value={ev.time} onChange={e => {
                                        const newEvs = [...scannedEvents];
                                        newEvs[idx].time = e.target.value;
                                        setScannedEvents(newEvs);
                                    }} style={{ flex: 1, padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }} placeholder="時間" />
                                </div>

                                <input value={ev.location} onChange={e => {
                                    const newEvs = [...scannedEvents];
                                    newEvs[idx].location = e.target.value;
                                    setScannedEvents(newEvs);
                                }} style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }} placeholder="地點" />

                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                    <button onClick={() => handleSaveCandidate(ev, idx)} style={{ flex: 1, background: '#2a9d8f', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}>確認</button>
                                    <button onClick={() => handleDiscardCandidate(idx)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}><X size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Event List Table / Cards */}
            <h3>活動列表 ({events.length})</h3>
            {isMobile ? (
                <div>
                    {events.map(event => (
                        <EventCard key={event.id} event={event} onDelete={handleDelete} />
                    ))}
                </div>
            ) : (
                <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <tr>
                                <th style={{ padding: '1rem', textAlign: 'left', width: '80px' }}>海報</th>
                                <th style={{ padding: '1rem', textAlign: 'left' }}>日期</th>
                                <th style={{ padding: '1rem', textAlign: 'left' }}>名稱/來源</th>
                                <th style={{ padding: '1rem', textAlign: 'left' }}>地點</th>
                                <th style={{ padding: '1rem', textAlign: 'left' }}>縣市</th>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map(event => (
                                <tr key={event.id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '1rem' }}>
                                        {event.poster_url && (
                                            <div style={{ width: '50px', height: '70px', borderRadius: '4px', overflow: 'hidden', cursor: 'zoom-in', background: '#f3f4f6' }} onClick={() => setExpandedImage(event.poster_url)}>
                                                <img src={event.poster_url} alt="poster" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                                        <div style={{ fontWeight: '500' }}>{event.date}</div>
                                        <small style={{ color: '#6b7280' }}>{event.time}</small>
                                    </td>
                                    <td style={{ padding: '1rem', maxWidth: '300px' }}>
                                        <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>{event.title}</div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {event.source_url?.includes('blood.org.tw') && <span style={{ fontSize: '0.75rem', background: '#d1fae5', color: '#065f46', padding: '2px 6px', borderRadius: '4px' }}>官網</span>}
                                            {event.source_url?.includes('ptt.cc') && <span style={{ fontSize: '0.75rem', background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: '4px' }}>PTT</span>}
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>{event.location}</td>
                                    <td style={{ padding: '1rem' }}>{event.city}</td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <button onClick={() => handleDelete(event.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Lightbox */}
            {expandedImage && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, cursor: 'zoom-out' }} onClick={() => setExpandedImage(null)}>
                    <img src={expandedImage} alt="Expanded" style={{ maxHeight: '90vh', maxWidth: '90vw', borderRadius: '4px' }} />
                </div>
            )}
        </div>
    );
};

export default EventManager;
