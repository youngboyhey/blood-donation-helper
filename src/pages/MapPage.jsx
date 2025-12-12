import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { APIProvider, Map, AdvancedMarker, InfoWindow, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { supabase } from '../lib/supabase';
import styles from './MapPage.module.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// 台灣中心點（預設位置）
const TAIWAN_CENTER = { lat: 23.973875, lng: 120.982024 };

const MapPage = () => {
    const navigate = useNavigate();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState(null);
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

    const handleMarkerClick = (event) => {
        setSelectedEvent(event);
        setMapCenter({ lat: event.latitude, lng: event.longitude });
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

                            {/* 活動標記 */}
                            {events.map((event) => (
                                <AdvancedMarker
                                    key={event.id}
                                    position={{ lat: event.latitude, lng: event.longitude }}
                                    onClick={() => handleMarkerClick(event)}
                                >
                                    <div className={styles.eventMarker}>
                                        <img src="/favicon.png" alt="marker" />
                                    </div>
                                </AdvancedMarker>
                            ))}

                            {/* InfoWindow */}
                            {selectedEvent && (
                                <InfoWindow
                                    position={{ lat: selectedEvent.latitude, lng: selectedEvent.longitude }}
                                    onCloseClick={() => setSelectedEvent(null)}
                                    pixelOffset={[0, -40]}
                                >
                                    <div className={styles.infoWindow}>
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
