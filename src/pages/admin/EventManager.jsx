import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { analyzeImage } from '../../utils/ai';
import { Trash2, Save, X, Play } from 'lucide-react';

const EventManager = () => {
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

    useEffect(() => {
        fetchEvents();
    }, []);

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
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        setStatusMessage("正在上傳圖片至 Supabase...");
        try {
            const fileName = `${Date.now()}_${file.name}`;
            const { data, error } = await supabase.storage.from('posters').upload(fileName, file);

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage.from('posters').getPublicUrl(fileName);
            console.log('Uploaded:', publicUrl);

            setUploading(false);
            setStatusMessage("");

            setPendingImageUrl(publicUrl);
            setPendingFileName(file.name);

        } catch (error) {
            console.error('Upload failed:', error);
            alert('上傳失敗: ' + error.message);
            setStatusMessage("");
            setUploading(false);
        }
    };

    const handleStartAnalysis = async () => {
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
        } finally {
            setAnalyzing(false);
        }
    };

    const handleCancelPending = () => {
        setPendingImageUrl(null);
        setPendingFileName("");
        setCustomApiKey("");
    };

    const handleSaveCandidate = async (candidate, index) => {
        const newEvent = {
            title: candidate.title,
            date: candidate.date,
            time: candidate.time,
            location: candidate.location,
            city: candidate.city,
            district: candidate.district,
            organizer: candidate.organizer,
            gift: candidate.gift,
            tags: candidate.tags,
            poster_url: candidate.poster_url,
            source_url: candidate.poster_url
        };

        // Check for duplicate
        const { data: existingEvents } = await supabase
            .from('events')
            .select('id, title, date, location, city')
            .eq('date', candidate.date);

        const duplicates = existingEvents?.filter(ev => {
            const locA = (ev.location || '').toLowerCase().replace(/\s/g, '');
            const locB = (candidate.location || '').toLowerCase().replace(/\s/g, '');
            return locA.includes(locB) || locB.includes(locA) || locA === locB;
        }) || [];

        if (duplicates.length > 0) {
            const dupInfo = duplicates.map(d => `• ${d.title} @ ${d.location}`).join('\n');
            const action = window.confirm(
                `⚠️ 發現可能重複的活動：\n\n${dupInfo}\n\n日期: ${candidate.date}\n地點: ${candidate.location}\n\n點擊「確定」覆蓋現有活動，點擊「取消」放棄儲存。`
            );

            if (!action) return;

            for (const dup of duplicates) {
                await supabase.from('events').delete().eq('id', dup.id);
            }
        }

        const { error } = await supabase.from('events').insert([newEvent]);
        if (error) {
            alert('儲存失敗: ' + error.message);
        } else {
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
        <div>
            {/* Upload Section */}
            <div style={{ marginBottom: '2rem', padding: '1.5rem', border: '2px dashed #ccc', borderRadius: '12px', textAlign: 'center', background: 'white' }}>
                <h3>上傳活動海報</h3>
                <p style={{ color: '#666' }}>AI 將自動辨識海報內容並填寫資訊</p>

                <div style={{ marginBottom: '1rem' }}>
                    <input
                        type="password"
                        placeholder="輸入自訂 Gemini API Key（選填）"
                        value={customApiKey}
                        onChange={(e) => setCustomApiKey(e.target.value)}
                        style={{ padding: '0.5rem', width: '300px', marginRight: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    <small style={{ color: '#666' }}>若不輸入則使用系統預設 Key</small>
                </div>

                <input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploading || analyzing || pendingImageUrl} />

                {uploading && <div style={{ marginTop: '1rem', color: '#007bff' }}>⏳ 上傳中...</div>}

                {pendingImageUrl && !analyzing && (
                    <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #0284c7' }}>
                        <p style={{ marginBottom: '0.5rem' }}>✅ 已上傳: <strong>{pendingFileName}</strong></p>
                        <img src={pendingImageUrl} alt="preview" style={{ maxHeight: '150px', borderRadius: '4px', marginBottom: '1rem' }} />
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button onClick={handleStartAnalysis} style={{ padding: '0.75rem 1.5rem', background: '#e63946', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '1rem' }}>
                                <Play size={18} /> 開始分析
                            </button>
                            <button onClick={handleCancelPending} style={{ padding: '0.75rem 1rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                取消
                            </button>
                        </div>
                    </div>
                )}

                {analyzing && <div style={{ marginTop: '1rem', color: '#007bff' }}>🤖 {statusMessage}</div>}
            </div>

            {/* AI Confirmation Section */}
            {showScanner && (
                <div style={{ marginBottom: '2rem', border: '1px solid #e63946', padding: '1rem', borderRadius: '8px', background: '#fff5f5' }}>
                    <h3>AI 辨識結果確認 ({scannedEvents.length})</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                        {scannedEvents.map((ev, idx) => (
                            <div key={idx} style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                                <img src={ev.poster_url} alt="preview" style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px', marginBottom: '0.5rem' }} />
                                <div>
                                    <label>標題</label>
                                    <input value={ev.title} onChange={e => {
                                        const newEvs = [...scannedEvents];
                                        newEvs[idx].title = e.target.value;
                                        setScannedEvents(newEvs);
                                    }} style={{ width: '100%', marginBottom: '0.5rem' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input type="date" value={ev.date} onChange={e => {
                                        const newEvs = [...scannedEvents];
                                        newEvs[idx].date = e.target.value;
                                        setScannedEvents(newEvs);
                                    }} style={{ flex: 1 }} />
                                    <input value={ev.time} onChange={e => {
                                        const newEvs = [...scannedEvents];
                                        newEvs[idx].time = e.target.value;
                                        setScannedEvents(newEvs);
                                    }} style={{ flex: 1 }} />
                                </div>
                                <div style={{ marginTop: '0.5rem' }}>
                                    <label>贈品: {ev.gift?.name || '無'}</label>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                    <button onClick={() => handleSaveCandidate(ev, idx)} style={{ flex: 1, background: '#2a9d8f', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}>
                                        <Save size={16} /> 確認新增
                                    </button>
                                    <button onClick={() => handleDiscardCandidate(idx)} style={{ background: '#e63946', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}>
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Event List */}
            <h3>現有活動列表 ({events.length})</h3>
            <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f1f1f1' }}>
                        <tr>
                            <th style={{ padding: '1rem', textAlign: 'left', width: '80px' }}>圖片</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>日期</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>活動名稱</th>
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
                                        <div style={{ width: '60px', height: '80px', borderRadius: '4px', overflow: 'hidden', cursor: 'zoom-in', background: '#eee' }} onClick={() => setExpandedImage(event.poster_url)}>
                                            <img src={event.poster_url} alt="poster" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '1rem' }}>{event.date} <br /> <small style={{ color: '#666' }}>{event.time}</small></td>
                                <td style={{ padding: '1rem', maxWidth: '300px' }}>
                                    <div style={{ fontWeight: '500' }}>{event.title}</div>
                                    <small style={{ color: '#e63946' }}>{event.gift?.name}</small>
                                </td>
                                <td style={{ padding: '1rem' }}>{event.location}</td>
                                <td style={{ padding: '1rem' }}>{event.city}</td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    <button onClick={() => handleDelete(event.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e63946' }}>
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {events.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>目前沒有活動資料</div>}
            </div>

            {/* Lightbox */}
            {expandedImage && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, cursor: 'zoom-out' }} onClick={() => setExpandedImage(null)}>
                    <img src={expandedImage} alt="Expanded" style={{ maxHeight: '90vh', maxWidth: '90vw', borderRadius: '4px' }} />
                </div>
            )}
        </div>
    );
};

export default EventManager;
