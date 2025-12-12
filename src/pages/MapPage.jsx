import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { APIProvider, Map, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import { supabase } from '../lib/supabase';
import styles from './MapPage.module.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// 台灣中心點（預設位置）
const TAIWAN_CENTER = { lat: 23.973875, lng: 120.982024 };

const MapPage = () => {
    const navigate = useNavigate();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedLocation, setSelectedLocation] = useState(null); // 選中的位置 key
    const [selectedEventIndex, setSelectedEventIndex] = useState(0); // 同一位置多活動時的索引
    const [userLocation, setUserLocation] = useState(null);
    const [mapCenter, setMapCenter] = useState(TAIWAN_CENTER);

    useEffect(() => {
        fetchEvents();
        getUserLocation();
    }, []);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .gte('date', today)
                .not('latitude', 'is', null)
                .not('longitude', 'is', null)
                .order('date', { ascending: true });

            if (error) {
                console.error('Error fetching events:', error);
            } else {
                setEvents(data || []);
            }
        } catch (err) {
            console.error('Unexpected error:', err);
        } finally {
            setLoading(false);
        }
    };

    // 將活動按位置分組（經緯度四捨五入到小數點後4位作為key）
    const groupedEvents = useMemo(() => {
        const groups = {};
        events.forEach(event => {
            // 四捨五入到小數4位（約11公尺精度），視為同一位置
            const key = `${event.latitude.toFixed(4)}_${event.longitude.toFixed(4)}`;
            if (!groups[key]) {
                groups[key] = {
                    lat: event.latitude,
                    lng: event.longitude,
                    events: []
                };
            }
            groups[key].events.push(event);
        });
        return groups;
    }, [events]);

    const getUserLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const loc = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    setUserLocation(loc);
                    setMapCenter(loc);
                },
                (error) => {
                    console.log('無法取得位置:', error.message);
                }
            );
        }
    };

    const handleMarkerClick = (locationKey) => {
        setSelectedLocation(locationKey);
        setSelectedEventIndex(0); // 重置為第一個活動
        const group = groupedEvents[locationKey];
        if (group) {
            setMapCenter({ lat: group.lat, lng: group.lng });
        }
    };

    const handleNavigate = (event) => {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`;
        window.open(url, '_blank');
    };

    // 取得贈品文字
    const getGiftText = (gift) => {
        if (!gift) return '以現場提供為主';
        if (typeof gift === 'string') return gift;
        return gift.name || '以現場提供為主';
    };

    // 選中位置的活動群組
    const selectedGroup = selectedLocation ? groupedEvents[selectedLocation] : null;
    const selectedEvent = selectedGroup?.events[selectedEventIndex];

    if (!GOOGLE_MAPS_API_KEY) {
        return (
            <div className={styles.container}>
                <div className={styles.error}>
                    <h2>⚠️ 缺少 Google Maps API Key</h2>
                    <p>請在 .env 中設定 VITE_GOOGLE_MAPS_API_KEY</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <button className={styles.backButton} onClick={() => navigate('/')}>
                    ← 返回首頁
                </button>
                <h1 className={styles.title}>活動地圖</h1>
                <span className={styles.count}>{events.length} 個活動</span>
            </div>

            {/* Map */}
            <div className={styles.mapContainer}>
                {loading ? (
                    <div className={styles.loading}>載入中...</div>
                ) : (
                    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                        <Map
                            defaultZoom={userLocation ? 12 : 8}
                            defaultCenter={mapCenter}
                            center={mapCenter}
                            mapId="blood-donation-map"
                            gestureHandling="greedy"
                            disableDefaultUI={false}
                            style={{ width: '100%', height: '100%' }}
                        >
                            {/* 使用者位置標記 */}
                            {userLocation && (
                                <AdvancedMarker position={userLocation}>
                                    <div className={styles.userMarker}>📍</div>
                                </AdvancedMarker>
                            )}

                            {/* 活動標記（按位置分組） */}
                            {Object.entries(groupedEvents).map(([key, group]) => (
                                <AdvancedMarker
                                    key={key}
                                    position={{ lat: group.lat, lng: group.lng }}
                                    onClick={() => handleMarkerClick(key)}
                                >
                                    <div className={styles.eventMarker}>
                                        <img src="/favicon.png" alt="marker" />
                                        {/* 如果有多個活動，顯示數量 */}
                                        {group.events.length > 1 && (
                                            <span className={styles.markerBadge}>
                                                {group.events.length}
                                            </span>
                                        )}
                                    </div>
                                </AdvancedMarker>
                            ))}

                            {/* InfoWindow */}
                            {selectedEvent && selectedGroup && (
                                <InfoWindow
                                    position={{ lat: selectedGroup.lat, lng: selectedGroup.lng }}
                                    onCloseClick={() => setSelectedLocation(null)}
                                    pixelOffset={[0, -40]}
                                >
                                    <div className={styles.infoWindow}>
                                        {/* 多活動切換器 */}
                                        {selectedGroup.events.length > 1 && (
                                            <div className={styles.eventSwitcher}>
                                                <button
                                                    className={styles.switchButton}
                                                    disabled={selectedEventIndex === 0}
                                                    onClick={() => setSelectedEventIndex(i => i - 1)}
                                                >
                                                    ◀
                                                </button>
                                                <span className={styles.eventCounter}>
                                                    {selectedEventIndex + 1} / {selectedGroup.events.length} 場活動
                                                </span>
                                                <button
                                                    className={styles.switchButton}
                                                    disabled={selectedEventIndex >= selectedGroup.events.length - 1}
                                                    onClick={() => setSelectedEventIndex(i => i + 1)}
                                                >
                                                    ▶
                                                </button>
                                            </div>
                                        )}

                                        <h3>{selectedEvent.title}</h3>
                                        <p className={styles.infoDate}>
                                            📅 {selectedEvent.date} {selectedEvent.time}
                                        </p>
                                        <p className={styles.infoLocation}>
                                            📍 {selectedEvent.city} {selectedEvent.district}
                                        </p>
                                        <p className={styles.infoLocationDetail}>
                                            {selectedEvent.location}
                                        </p>
                                        <p className={styles.infoGift}>
                                            🎁 {getGiftText(selectedEvent.gift)}
                                        </p>
                                        <div className={styles.infoActions}>
                                            <button
                                                className={styles.navigateButton}
                                                onClick={() => handleNavigate(selectedEvent)}
                                            >
                                                🧭 導航前往
                                            </button>
                                        </div>
                                    </div>
                                </InfoWindow>
                            )}
                        </Map>
                    </APIProvider>
                )}
            </div>
        </div>
    );
};

export default MapPage;
