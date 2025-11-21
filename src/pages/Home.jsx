import React, { useState, useEffect } from 'react';
import SearchBar from '../components/SearchBar';
import EventList from '../components/EventList';
import eventsData from '../data/events.json';
import styles from './Home.module.css';
import Modal from '../components/Modal';

const Home = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredEvents, setFilteredEvents] = useState(eventsData);
    const [selectedEvent, setSelectedEvent] = useState(null);

    useEffect(() => {
        const results = eventsData.filter(event => {
            const term = searchTerm.toLowerCase();
            return (
                event.title.toLowerCase().includes(term) ||
                event.location.toLowerCase().includes(term) ||
                event.gift.name.toLowerCase().includes(term) ||
                event.tags.some(tag => tag.toLowerCase().includes(term))
            );
        });
        setFilteredEvents(results);
    }, [searchTerm]);

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>捐血小幫手</h1>
                <p className={styles.subtitle}>查詢附近的捐血活動與豐富贈品</p>
            </header>

            <div className={styles.searchSection}>
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
                        <p><strong>名稱:</strong> {selectedEvent.gift.name}</p>
                        <p><strong>價值:</strong> ${selectedEvent.gift.value}</p>
                        <p><strong>數量:</strong> {selectedEvent.gift.quantity}</p>
                        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                            <img
                                src={selectedEvent.gift.image}
                                alt={selectedEvent.gift.name}
                                style={{ maxWidth: '100%', borderRadius: '8px' }}
                            />
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Home;
