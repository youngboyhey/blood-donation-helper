import React, { useState, useEffect } from 'react';
import { ExternalLink, CheckCircle, XCircle, BarChart3 } from 'lucide-react';

const Analytics = () => {
    const [gaStatus, setGaStatus] = useState({ installed: false, trackingId: null });

    useEffect(() => {
        // Check if GA is installed by looking for gtag in the page
        const checkGAInstalled = () => {
            const scripts = document.querySelectorAll('script');
            let trackingId = null;

            scripts.forEach(script => {
                const src = script.src || '';
                if (src.includes('googletagmanager.com/gtag/js')) {
                    // Extract tracking ID from URL
                    const match = src.match(/id=(G-[A-Z0-9]+)/);
                    if (match) {
                        trackingId = match[1];
                    }
                }
            });

            // Also check if gtag function exists
            const hasGtag = typeof window.gtag === 'function';

            setGaStatus({
                installed: hasGtag && trackingId && !trackingId.includes('%'),
                trackingId: trackingId && !trackingId.includes('%') ? trackingId : null
            });
        };

        checkGAInstalled();
    }, []);

    const gaLink = gaStatus.trackingId
        ? `https://analytics.google.com/analytics/web/#/p${gaStatus.trackingId.replace('G-', '')}/reports/reportinghub`
        : 'https://analytics.google.com/';

    return (
        <div>
            {/* Status Card */}
            <div style={{
                background: 'white',
                padding: '2rem',
                borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                border: '1px solid #f0f0f0',
                marginBottom: '1.5rem'
            }}>
                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <BarChart3 size={24} color="#e63946" />
                    Google Analytics 狀態
                </h3>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1.5rem',
                    background: gaStatus.installed ? '#f0fdf4' : '#fef2f2',
                    borderRadius: '12px',
                    border: `1px solid ${gaStatus.installed ? '#86efac' : '#fecaca'}`
                }}>
                    {gaStatus.installed ? (
                        <CheckCircle size={32} color="#22c55e" />
                    ) : (
                        <XCircle size={32} color="#ef4444" />
                    )}
                    <div>
                        <div style={{
                            fontSize: '1.2rem',
                            fontWeight: '600',
                            color: gaStatus.installed ? '#166534' : '#991b1b'
                        }}>
                            {gaStatus.installed ? '✓ GA 追蹤已啟用' : '✗ GA 追蹤未啟用'}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.25rem' }}>
                            {gaStatus.trackingId
                                ? `追蹤代碼: ${gaStatus.trackingId}`
                                : '請在 GitHub Secrets 中設定 GA_TRACKING_ID 並重新部署'
                            }
                        </div>
                    </div>
                </div>
            </div>

            {/* GA Link Card */}
            <div style={{
                background: 'white',
                padding: '2rem',
                borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                border: '1px solid #f0f0f0'
            }}>
                <h3 style={{ marginBottom: '1rem' }}>查看流量數據</h3>
                <p style={{ color: '#666', marginBottom: '1.5rem' }}>
                    點擊下方按鈕前往 Google Analytics 後台查看即時流量、使用者行為等分析數據。
                </p>

                <a
                    href={gaLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '1rem 2rem',
                        background: 'linear-gradient(135deg, #4285f4 0%, #34a853 100%)',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '12px',
                        fontWeight: '600',
                        fontSize: '1rem',
                        boxShadow: '0 4px 12px rgba(66, 133, 244, 0.3)',
                        transition: 'transform 0.2s ease'
                    }}
                >
                    <ExternalLink size={20} />
                    前往 Google Analytics 後台
                </a>

                {/* Setup Instructions */}
                {!gaStatus.installed && (
                    <div style={{
                        marginTop: '2rem',
                        padding: '1rem',
                        background: '#fff7ed',
                        borderRadius: '8px',
                        border: '1px solid #fed7aa'
                    }}>
                        <strong style={{ color: '#9a3412' }}>⚙️ 設定方式：</strong>
                        <ol style={{ margin: '0.5rem 0 0 1.5rem', color: '#9a3412', lineHeight: 1.8 }}>
                            <li>前往 GitHub Repository → Settings → Secrets</li>
                            <li>新增 Secret: <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: '4px' }}>GA_TRACKING_ID</code></li>
                            <li>值填入您的 GA4 追蹤碼（如 G-XXXXXXXXXX）</li>
                            <li>重新執行 GitHub Actions 部署</li>
                        </ol>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Analytics;
