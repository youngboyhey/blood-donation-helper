import React from 'react';
import EventCard from './EventCard';
import styles from './EventList.module.css';

const EventList = ({ events, onEventClick }) => {
    if (!events || events.length === 0) {
        return (
            <div className={styles.emptyState}>
                <p>目前沒有符合條件的捐血活動。</p>
            </div>
        );
    }

    return (
        <div className={styles.grid}>
            {events.map((event) => (
                <EventCard key={event.id} event={event} onClick={onEventClick} />
            ))}
        </div>
    );
};

export default EventList;
