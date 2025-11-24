import React, { useState, useEffect } from 'react';
import SearchBar from '../components/SearchBar';
import EventList from '../components/EventList';
import eventsData from '../data/events.json';
import styles from './Home.module.css';
import Modal from '../components/Modal';

const Home = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCity, setSelectedCity] = useState('');
    const [selectedDistrict, setSelectedDistrict] = useState('');
    const [filteredEvents, setFilteredEvents] = useState(eventsData);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);

    // 台灣縣市標準排序
    const CITY_ORDER = [
        '基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣',
        '台中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '台南市',
        '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'
    ];

    // 提取所有有活動的縣市並排序
    const cities = [...new Set(eventsData.map(e => e.city).filter(c => c && c !== 'null' && c !== 'undefined'))].sort((a, b) => {
        const indexA = CITY_ORDER.indexOf(a);
        const indexB = CITY_ORDER.indexOf(b);
        // 如果都在列表中，照順序排
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        // 如果只有 A 在列表中，A 排前面
        if (indexA !== -1) return -1;
        // 如果只有 B 在列表中，B 排前面
        if (indexB !== -1) return 1;
        // 都不在列表中，照字串排序
        return a.localeCompare(b, 'zh-TW');
    });

    // 根據選擇的縣市提取有活動的區域並排序
    const districts = selectedCity
        ? [...new Set(eventsData.filter(e => e.city === selectedCity).map(e => e.district).filter(d => d && d !== 'null' && d !== 'undefined'))].sort((a, b) => {
            // 區域暫時使用筆畫/字串排序，因為各縣市區域順序繁多
            return a.localeCompare(b, 'zh-TW');
        })
        : [];

    useEffect(() => {
        const results = eventsData.filter(event => {
            const matchesSearch = (
                event.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                event.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                event.gift?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                event.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
            );
            const matchesCity = selectedCity ? event.city === selectedCity : true;
            const matchesDistrict = selectedDistrict ? event.district === selectedDistrict : true;

            return matchesSearch && matchesCity && matchesDistrict;
        });

        // 依照日期排序：由近到遠
        results.sort((a, b) => new Date(a.date) - new Date(b.date));

        setFilteredEvents(results);
    }, [searchTerm, selectedCity, selectedDistrict]);

    const handleCityChange = (e) => {
        setSelectedCity(e.target.value);
        setSelectedDistrict(''); // 重置區域選擇
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
                <SearchBar onSearch={setSearchTerm} />
            </div>

            <main className={styles.main}>
                <div className={styles.listHeader}>
                    <h2>捐血活動</h2>
                    <span className={styles.count}>共 {filteredEvents.length} 場活動</span>
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
                        <p>{selectedEvent.gift?.name || '以現場提供為主'}</p>
                        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                            {selectedEvent.gift?.image && (
                                <img
                                    src={selectedEvent.gift.image}
                                    alt={selectedEvent.gift?.name || '贈品圖片'}
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '300px',
                                        borderRadius: '8px',
                                        cursor: 'zoom-in',
                                        objectFit: 'contain'
                                    }}
                                    onClick={() => setSelectedImage(selectedEvent.gift.image)}
                                    title="點擊放大圖片"
                                />
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

export default Home;
