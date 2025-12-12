import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF } from '@react-google-maps/api';
import { supabase } from '../lib/supabase';
import styles from './MapPage.module.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// 台灣中心點（預設位置）
const TAIWAN_CENTER = { lat: 23.973875, lng: 120.982024 };

const containerStyle = {
    width: '100%',
    height: 'calc(100vh - 60px)'
};

const MapPage = () => {
    const navigate = useNavigate();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [selectedEventIndex, setSelectedEventIndex] = useState(0);
    const [userLocation, setUserLocation] = useState(null);
    const [mapCenter, setMapCenter] = useState(TAIWAN_CENTER);
    const [map, setMap] = useState(null);

    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: GOOGLE_MAPS_API_KEY
    });

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

    // 將活動按位置分組
    const groupedEvents = useMemo(() => {
        const groups = {};
        events.forEach(event => {
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
        setSelectedEventIndex(0);
        const group = groupedEvents[locationKey];
        if (group) {
            setMapCenter({ lat: group.lat, lng: group.lng });
        }
    };

    const handleNavigate = (event) => {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`;
        window.open(url, '_blank');
    };

    const getGiftText = (gift) => {
        if (!gift) return '以現場提供為主';
        if (typeof gift === 'string') return gift;
        return gift.name || '以現場提供為主';
    };

    const selectedGroup = selectedLocation ? groupedEvents[selectedLocation] : null;
    const selectedEvent = selectedGroup?.events[selectedEventIndex];

    const onLoad = useCallback((map) => {
        setMap(map);
        console.log('Map loaded successfully');
    }, []);

    const onUnmount = useCallback((map) => {
        setMap(null);
    }, []);

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

    if (loadError) {
        return (
            <div className={styles.container}>
                <div className={styles.error}>
                    <h2>⚠️ Google Maps 載入失敗</h2>
                    <p>{loadError.message}</p>
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
            <div className={styles.mapContainer} style={{ height: 'calc(100vh - 60px)' }}>
                {loading || !isLoaded ? (
                    <div className={styles.loading}>載入中...</div>
                ) : (
                    <GoogleMap
                        mapContainerStyle={containerStyle}
                        center={mapCenter}
                        zoom={userLocation ? 12 : 8}
                        onLoad={onLoad}
                        onUnmount={onUnmount}
                        options={{
                            gestureHandling: 'greedy',
                            disableDefaultUI: false
                        }}
                    >
                        {/* 使用者位置標記 */}
                        {userLocation && (
                            <MarkerF
                                position={userLocation}
                                icon={{
                                    url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                                }}
                                title="你的位置"
                            />
                        )}

                        {/* 活動標記 */}
                        {Object.entries(groupedEvents).map(([key, group]) => (
                            <MarkerF
                                key={key}
                                position={{ lat: group.lat, lng: group.lng }}
                                onClick={() => handleMarkerClick(key)}
                                title={`${group.events.length} 個活動`}
                            />
                        ))}

                        {/* InfoWindow */}
                        {selectedEvent && selectedGroup && (
                            <InfoWindowF
                                position={{ lat: selectedGroup.lat, lng: selectedGroup.lng }}
                                onCloseClick={() => setSelectedLocation(null)}
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
                            </InfoWindowF>
                        )}
                    </GoogleMap>
                )}
            </div>
        </div>
    );
};

export default MapPage;
