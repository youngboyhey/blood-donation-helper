import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, Eye, CheckCircle, Loader2 } from 'lucide-react';

const SEOSettings = () => {
    const [seo, setSeo] = useState({
        title: '捐血小幫手 - 查詢捐血活動與贈品',
        description: '捐血小幫手 - 查詢全台捐血活動、地點與豐富贈品資訊。即時掌握最新捐血好康，一起熱血助人！',
        keywords: '捐血, 捐血活動, 捐血贈品, 捐血地點, 台北捐血, 台中捐血, 高雄捐血',
        ogImage: ''
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSeoSettings();
    }, []);

    const loadSeoSettings = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'seo')
            .single();

        if (data && data.value) {
            setSeo(data.value);
        }
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);

        const { error } = await supabase
            .from('settings')
            .upsert({
                key: 'seo',
                value: seo,
                updated_at: new Date().toISOString()
            });

        if (error) {
            alert('儲存失敗: ' + error.message);
        } else {
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                <Loader2 size={32} className="animate-spin" style={{ color: '#e63946' }} />
            </div>
        );
    }

    return (
        <div>
            <div style={{
                background: 'white',
                padding: '2rem',
                borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                border: '1px solid #f0f0f0'
            }}>
                <h3 style={{ marginBottom: '1.5rem' }}>SEO 設定</h3>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        網站標題 (Title Tag)
                    </label>
                    <input
                        type="text"
                        value={seo.title}
                        onChange={(e) => setSeo({ ...seo, title: e.target.value })}
                        style={{ width: '100%', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '8px', fontSize: '1rem' }}
                    />
                    <small style={{ color: '#666' }}>建議 50-60 個字元。目前：{seo.title.length} 字元</small>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        網站描述 (Meta Description)
                    </label>
                    <textarea
                        value={seo.description}
                        onChange={(e) => setSeo({ ...seo, description: e.target.value })}
                        rows={3}
                        style={{ width: '100%', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '8px', fontSize: '1rem', resize: 'vertical' }}
                    />
                    <small style={{ color: '#666' }}>建議 150-160 個字元。目前：{seo.description.length} 字元</small>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        關鍵字 (Keywords)
                    </label>
                    <input
                        type="text"
                        value={seo.keywords}
                        onChange={(e) => setSeo({ ...seo, keywords: e.target.value })}
                        style={{ width: '100%', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '8px', fontSize: '1rem' }}
                    />
                    <small style={{ color: '#666' }}>以逗號分隔</small>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        社群分享圖片 (OG Image URL)
                    </label>
                    <input
                        type="text"
                        value={seo.ogImage}
                        onChange={(e) => setSeo({ ...seo, ogImage: e.target.value })}
                        placeholder="https://example.com/og-image.jpg"
                        style={{ width: '100%', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '8px', fontSize: '1rem' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: saving ? '#ccc' : '#2a9d8f',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '1rem'
                        }}
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {saving ? '儲存中...' : '儲存變更'}
                    </button>
                    {saved && (
                        <span style={{ color: '#2a9d8f', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <CheckCircle size={16} /> 已儲存！下次部署時生效
                        </span>
                    )}
                </div>

                <div style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    background: '#f0fdf4',
                    borderRadius: '8px',
                    border: '1px solid #86efac',
                    color: '#166534'
                }}>
                    <strong>✓ 設定流程：</strong>
                    <ol style={{ margin: '0.5rem 0 0 1.5rem', lineHeight: 1.8 }}>
                        <li>在此頁面修改 SEO 設定並儲存</li>
                        <li>設定會儲存到 Supabase</li>
                        <li>下次 GitHub Actions 部署時自動套用到 index.html</li>
                    </ol>
                </div>
            </div>

            {/* Preview */}
            <div style={{
                marginTop: '1.5rem',
                background: 'white',
                padding: '2rem',
                borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                border: '1px solid #f0f0f0'
            }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Eye size={18} /> Google 搜尋結果預覽
                </h3>
                <div style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px', fontFamily: 'Arial, sans-serif' }}>
                    <div style={{ color: '#1a0dab', fontSize: '18px', marginBottom: '4px' }}>
                        {seo.title}
                    </div>
                    <div style={{ color: '#006621', fontSize: '14px', marginBottom: '4px' }}>
                        youngboyhey.github.io › blood-donation-helper
                    </div>
                    <div style={{ color: '#545454', fontSize: '14px' }}>
                        {seo.description.length > 160 ? seo.description.substring(0, 160) + '...' : seo.description}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SEOSettings;
