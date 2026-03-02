'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SearchBar from './SearchBar';
import EventList from './EventList';
import Modal from './Modal';
import styles from './Home.module.css';

// Haversine 公式計算兩點間距離 (km)
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

const HomeClient = ({ initialEvents }) => {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCity, setSelectedCity] = useState('');
    const [selectedDistrict, setSelectedDistrict] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [events, setEvents] = useState(initialEvents || []);
    const [filteredEvents, setFilteredEvents] = useState(initialEvents || []);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);

    // 距離排序相關
    const [userLocation, setUserLocation] = useState(null);
    const [sortByDistance, setSortByDistance] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);

    // Client-side fallback：若 SSR 沒拿到資料，在 client 端補抓
    useEffect(() => {
        if (events.length === 0) {
            const fetchFromClient = async () => {
                try {
                    const { supabase } = await import('../lib/supabase');
                    const today = new Date().toISOString().split('T')[0];
                    const { data } = await supabase
                        .from('events')
                        .select('*')
                        .gte('date', today)
                        .order('date', { ascending: true });
                    if (data && data.length > 0) {
                        setEvents(data);
                        setFilteredEvents(data);
                    }
                } catch (err) {
                    console.error('Client-side fetch failed:', err);
                }
            };
            fetchFromClient();
        }
    }, []);

    // 台灣縣市標準排序
    const CITY_ORDER = [
        '基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣',
        '台中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '台南市',
        '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'
    ];

    // Helper: Filter events by search term
    const filterBySearch = (event) => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();

        const giftText = typeof event.gift === 'string'
            ? event.gift
            : (event.gift?.name || '');

        return (
            event.title?.toLowerCase().includes(term) ||
            event.location?.toLowerCase().includes(term) ||
            event.organizer?.toLowerCase().includes(term) ||
            giftText?.toLowerCase().includes(term) ||
            event.tags?.some(tag => tag?.toLowerCase().includes(term))
        );
    };

    // 1. Calculate Available Cities & Districts (based on Date + Search)
    const eventsForLocationMenu = events.filter(event => {
        const matchesDate = selectedDate ? event.date === selectedDate : true;
        return matchesDate && filterBySearch(event);
    });

    const cities = [...new Set(eventsForLocationMenu.map(e => e.city).filter(c => c && c !== 'null' && c !== 'undefined'))].sort((a, b) => {
        const indexA = CITY_ORDER.indexOf(a);
        const indexB = CITY_ORDER.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b, 'zh-TW');
    });

    const districts = selectedCity
        ? [...new Set(eventsForLocationMenu.filter(e => e.city === selectedCity).map(e => e.district).filter(d => d && d !== 'null' && d !== 'undefined'))].sort((a, b) => a.localeCompare(b, 'zh-TW'))
        : [];

    const handleCityChange = (e) => {
        setSelectedCity(e.target.value);
        setSelectedDistrict('');
    };

    // 2. Calculate Available Dates & Counts (based on City + District + Search)
    const eventsForDateMenu = events.filter(event => {
        const matchesCity = selectedCity ? event.city === selectedCity : true;
        const matchesDistrict = selectedDistrict ? event.district === selectedDistrict : true;
        return matchesCity && matchesDistrict && filterBySearch(event);
    });

    const dateCounts = eventsForDateMenu.reduce((acc, event) => {
        const date = event.date.split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
    }, {});

    const uniqueDates = Object.keys(dateCounts).sort();

    // 3. Final Filtered Events (for the list)
    useEffect(() => {
        let results = events.filter(event => {
            const matchesSearch = filterBySearch(event);
            const matchesCity = selectedCity ? event.city === selectedCity : true;
            const matchesDistrict = selectedDistrict ? event.district === selectedDistrict : true;
            const matchesDate = selectedDate ? event.date === selectedDate : true;

            return matchesSearch && matchesCity && matchesDistrict && matchesDate;
        });

        // 排序邏輯
        if (sortByDistance && userLocation) {
            results = results.map(event => ({
                ...event,
                distance: event.latitude && event.longitude
                    ? getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, event.latitude, event.longitude)
                    : Infinity
            }));
            results.sort((a, b) => a.distance - b.distance);
        } else {
            results.sort((a, b) => new Date(a.date) - new Date(b.date));
        }

        setFilteredEvents(results);
    }, [searchTerm, selectedCity, selectedDistrict, selectedDate, events, sortByDistance, userLocation]);

    // 取得使用者位置並啟用距離排序
    const handleSortByDistance = () => {
        if (sortByDistance) {
            setSortByDistance(false);
            return;
        }

        if (userLocation) {
            setSortByDistance(true);
            return;
        }

        setLocationLoading(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                    setSortByDistance(true);
                    setLocationLoading(false);
                },
                (error) => {
                    alert('無法取得您的位置，請確認已授權位置存取。');
                    setLocationLoading(false);
                }
            );
        } else {
            alert('您的瀏覽器不支援定位功能。');
            setLocationLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>捐血小幫手</h1>
                <p className={styles.subtitle}>查詢附近的捐血活動與豐富贈品</p>
            </header>

            <div className={styles.filterSection}>
                <div className={styles.filters}>
                    <select
                        className={styles.select}
                        value={selectedCity}
                        onChange={handleCityChange}
                    >
                        <option value="">所有縣市</option>
                        {cities.map(city => (
                            <option key={city} value={city}>{city}</option>
                        ))}
                    </select>

                    <select
                        className={styles.select}
                        value={selectedDistrict}
                        onChange={(e) => setSelectedDistrict(e.target.value)}
                        disabled={!selectedCity}
                    >
                        <option value="">所有區域</option>
                        {districts.map(district => (
                            <option key={district} value={district}>{district}</option>
                        ))}
                    </select>
                </div>
                <div className={styles.searchWrapper}>
                    <SearchBar onSearch={setSearchTerm} />
                </div>
            </div>

            {/* Date Selection Menu */}
            <div style={{
                display: 'flex',
                overflowX: 'auto',
                padding: '12px 16px',
                background: '#fff',
                gap: '12px',
                marginBottom: '0.5rem',
                whiteSpace: 'nowrap',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
            }}>
                <style>{`
                    div::-webkit-scrollbar {
                        display: none;
                    }
                `}</style>
                <button
                    onClick={() => setSelectedDate('')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '12px',
                        border: selectedDate === '' ? 'none' : '1px solid #eee',
                        background: selectedDate === '' ? 'linear-gradient(135deg, #FF6B6B 0%, #FF4757 100%)' : '#fff',
                        color: selectedDate === '' ? '#fff' : '#555',
                        cursor: 'pointer',
                        fontWeight: selectedDate === '' ? '600' : '500',
                        fontSize: '0.95rem',
                        flexShrink: 0,
                        boxShadow: selectedDate === '' ? '0 4px 12px rgba(255, 107, 107, 0.3)' : '0 2px 6px rgba(0,0,0,0.04)',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    全部日期
                </button>
                {uniqueDates.map(date => {
                    const isSelected = selectedDate === date;
                    const dateObj = new Date(date);
                    const day = dateObj.getDate();
                    const month = dateObj.getMonth() + 1;
                    const weekDay = ['日', '一', '二', '三', '四', '五', '六'][dateObj.getDay()];

                    return (
                        <button
                            key={date}
                            onClick={() => setSelectedDate(date)}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: '60px',
                                padding: '8px 12px',
                                borderRadius: '12px',
                                border: isSelected ? 'none' : '1px solid #eee',
                                background: isSelected ? 'linear-gradient(135deg, #FF6B6B 0%, #FF4757 100%)' : '#fff',
                                color: isSelected ? '#fff' : '#555',
                                cursor: 'pointer',
                                flexShrink: 0,
                                boxShadow: isSelected ? '0 4px 12px rgba(255, 107, 107, 0.3)' : '0 2px 6px rgba(0,0,0,0.04)',
                                transition: 'all 0.2s ease',
                                position: 'relative'
                            }}
                        >
                            <span style={{ fontSize: '0.75rem', opacity: 0.9, marginBottom: '2px' }}>{month}/{day} ({weekDay})</span>
                            <span style={{
                                fontSize: '0.85rem',
                                fontWeight: 'bold',
                                background: isSelected ? 'rgba(255,255,255,0.2)' : '#f0f0f0',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                color: isSelected ? '#fff' : '#666'
                            }}>
                                {dateCounts[date]}場
                            </span>
                        </button>
                    )
                })}
            </div>

            <main className={styles.main}>
                <div className={styles.listHeader}>
                    <div className={styles.actionButtons}>
                        <button
                            className={`${styles.actionButton} ${sortByDistance ? styles.actionButtonActive : ''}`}
                            onClick={handleSortByDistance}
                            disabled={locationLoading}
                        >
                            {locationLoading ? '定位中...' : (sortByDistance ? '📍 依距離排序中' : '📍 依距離排序')}
                        </button>
                        <button
                            className={styles.actionButton}
                            onClick={() => router.push('/map')}
                        >
                            🗺️ 查看地圖
                        </button>
                    </div>
                    <span className={styles.count}>
                        共 {filteredEvents.length} 場活動
                        {sortByDistance && userLocation && ' (依距離排序)'}
                    </span>
                </div>
                <EventList events={filteredEvents} onEventClick={setSelectedEvent} />
            </main>

            <Modal
                isOpen={!!selectedEvent}
                onClose={() => setSelectedEvent(null)}
                title={selectedEvent?.title}
            >
                {selectedEvent && (
                    <div>
                        <p><strong>時間:</strong> {selectedEvent.date} {selectedEvent.time}</p>
                        <p><strong>地點:</strong> {selectedEvent.location}</p>
                        <p><strong>主辦單位:</strong> {selectedEvent.organizer}</p>
                        <hr style={{ margin: '1rem 0', border: '0', borderTop: '1px solid #eee' }} />
                        <h4>贈品資訊</h4>
                        <p>
                            {typeof selectedEvent.gift === 'string' && selectedEvent.gift && selectedEvent.gift !== 'null'
                                ? selectedEvent.gift
                                : (selectedEvent.gift?.name || '以現場提供為主')}
                        </p>
                        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                            {(selectedEvent.poster_url || selectedEvent.gift?.image) && (
                                <img
                                    src={selectedEvent.poster_url || selectedEvent.gift.image}
                                    alt={selectedEvent.title}
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '400px',
                                        borderRadius: '8px',
                                        cursor: 'zoom-in',
                                        objectFit: 'contain'
                                    }}
                                    onClick={() => setSelectedImage(selectedEvent.poster_url || selectedEvent.gift.image)}
                                    title="點擊放大圖片"
                                />
                            )}
                            {selectedEvent.source_url && (
                                <div style={{ marginTop: '10px' }}>
                                    <a
                                        href={selectedEvent.source_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: '#e63946', textDecoration: 'none', fontWeight: 'bold' }}
                                    >
                                        前往活動來源網頁 →
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* Lightbox Overlay */}
            {selectedImage && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 2000,
                        cursor: 'zoom-out'
                    }}
                    onClick={() => setSelectedImage(null)}
                >
                    <img
                        src={selectedImage}
                        alt="Full size"
                        style={{
                            maxWidth: '95vw',
                            maxHeight: '95vh',
                            objectFit: 'contain',
                            borderRadius: '4px'
                        }}
                    />
                    <button
                        style={{
                            position: 'absolute',
                            top: '20px',
                            right: '20px',
                            background: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '40px',
                            height: '40px',
                            fontSize: '20px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedImage(null);
                        }}
                    >
                        ×
                    </button>
                </div>
            )}
        </div>
    );
};

export default HomeClient;
