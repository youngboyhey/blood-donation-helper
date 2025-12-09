import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { analyzeImage } from '../utils/ai';
import { Trash2, Upload, Plus, Loader2, Save, X } from 'lucide-react';

const Admin = () => {
    const { signOut } = useAuth();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [scannedEvents, setScannedEvents] = useState([]); // AI result candidates
    const [showScanner, setShowScanner] = useState(false);
    const [expandedImage, setExpandedImage] = useState(null); // For Lightbox

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        setLoading(true);
        const { data } = await supabase.from('events').select('*').order('date', { ascending: false });
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
        try {
            const fileName = `${Date.now()}_${file.name}`;
            const { data, error } = await supabase.storage.from('posters').upload(fileName, file);

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage.from('posters').getPublicUrl(fileName);
            console.log('Uploaded:', publicUrl);

            // Step 2: Analyze with AI
            setAnalyzing(true);
            const aiResults = await analyzeImage(publicUrl);
            setAnalyzing(false);

            if (aiResults && aiResults.length > 0) {
                // Attach the poster URL to each result
                const candidates = aiResults.map(ev => ({ ...ev, poster_url: publicUrl }));
                setScannedEvents(candidates);
                setShowScanner(true);
            } else {
                alert("AI 無法辨識此圖片，請手動輸入或重試。");
            }

        } catch (error) {
            console.error('Upload failed:', error);
            alert('上傳失敗: ' + error.message);
        } finally {
            setUploading(false);
            setAnalyzing(false);
        }
    };

    const handleSaveCandidate = async (candidate, index) => {
        // Map candidate to DB schema
        const newEvent = {
            title: candidate.title,
            date: candidate.date,
            time: candidate.time,
            location: candidate.location,
            city: candidate.city,
            district: candidate.district,
            organizer: candidate.organizer,
            gift: candidate.gift, // JSONB
            tags: candidate.tags,
            poster_url: candidate.poster_url,
            source_url: candidate.poster_url // Default source to image
        };

        const { error } = await supabase.from('events').insert([newEvent]);
        if (error) {
            alert('儲存失敗: ' + error.message);
        } else {
            // Remove from candidates list
            const newCandidates = [...scannedEvents];
            newCandidates.splice(index, 1);
            setScannedEvents(newCandidates);
            fetchEvents(); // Refresh list
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
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1>活動管理後台</h1>
                <button onClick={signOut} style={{ padding: '0.5rem 1rem', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    登出
                </button>
            </div>

            {/* Upload Section */}
            <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', border: '2px dashed #dee2e6' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
                    <Upload size={20} />
                    上傳活動海報 (AI 自動辨識)
                </h3>
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={uploading || analyzing}
                    style={{ marginBottom: '1rem' }}
                />
                {(uploading || analyzing) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666' }}>
                        <Loader2 className="animate-spin" size={16} />
                        {uploading ? '上傳中...' : 'AI 正在分析海報內容...'}
                    </div>
                )}
            </div>

            {/* AI Confirmation Modal/Section */}
            {showScanner && (
                <div style={{ marginBottom: '2rem', border: '1px solid #e63946', padding: '1rem', borderRadius: '8px', background: '#fff5f5' }}>
                    <h3>AI 辨識結果確認 ({scannedEvents.length})</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                        {scannedEvents.map((ev, idx) => (
                            <div key={idx} style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                                <img src={ev.poster_url} alt="preview" style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px', marginBottom: '0.5rem' }} />
                                <div className="form-group">
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
                                        <div
                                            style={{ width: '60px', height: '80px', borderRadius: '4px', overflow: 'hidden', cursor: 'zoom-in', background: '#eee' }}
                                            onClick={() => setExpandedImage(event.poster_url)}
                                        >
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
            {/* Lightbox for Admin */}
            {expandedImage && (
                <div
                    style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, cursor: 'zoom-out' }}
                    onClick={() => setExpandedImage(null)}
                >
                    <img src={expandedImage} alt="Expanded" style={{ maxHeight: '90vh', maxWidth: '90vw', borderRadius: '4px' }} />
                </div>
            )}
        </div>
    );
};

export default Admin;
