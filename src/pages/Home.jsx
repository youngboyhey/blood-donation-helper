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

    // 提取所有有活動的縣市
    const cities = [...new Set(eventsData.map(e => e.city).filter(Boolean))];

    // 根據選擇的縣市提取有活動的區域
    const districts = selectedCity
        ? [...new Set(eventsData.filter(e => e.city === selectedCity).map(e => e.district).filter(Boolean))]
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
                    <h2>近期活動</h2>
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
                        <p><strong>名稱:</strong> {selectedEvent.gift?.name || '無'}</p>
                        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                            <a href={selectedEvent.gift?.image} target="_blank" rel="noopener noreferrer">
                                <img
                                    src={selectedEvent.gift?.image}
                                    alt={selectedEvent.gift?.name || '贈品圖片'}
                                    style={{ maxWidth: '100%', borderRadius: '8px', cursor: 'pointer' }}
                                    title="點擊查看大圖"
                                />
                            </a>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Home;
