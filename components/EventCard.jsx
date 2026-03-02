import React from 'react';
import Card from './Card';
import Button from './Button';
import styles from './EventCard.module.css';

const EventCard = ({ event, onClick }) => {
    const { title, date, time, location, gift, tags } = event;

    return (
        <Card hoverable className={styles.eventCard}>
            <div className={styles.header}>
                <span className={styles.dateBadge}>{event.date}</span>
                <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.mapLink}
                    title="開啟 Google 地圖導航"
                    onClick={(e) => e.stopPropagation()}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                </a>
            </div>
            <h3 className={styles.title}>{title}</h3>
            <div className={styles.meta}>
                <span className={styles.time}>{time}</span>
                <span className={styles.location}>{location}</span>
            </div>

            <div className={styles.giftSection}>
                <div className={styles.giftLabel}>贈品亮點</div>
                <div className={styles.giftContent}>
                    <span className={styles.giftName}>
                        {/* gift 可能是字串或物件，需要同時處理 */}
                        {typeof gift === 'string' && gift && gift !== 'null'
                            ? gift
                            : (gift?.name || '以現場提供為主')}
                    </span>
                </div>
            </div>

            <div className={styles.footer}>
                <div className={styles.tags}>
                    {event.city && <span className={styles.tag}>#{event.city}</span>}
                    {event.district && event.district !== 'null' && <span className={styles.tag}>#{event.district}</span>}
                    {!event.city && !event.district && tags && tags
                        .filter(tag => tag && tag !== 'null' && tag !== 'undefined')
                        .map((tag, index) => (
                            <span key={index} className={styles.tag}>#{tag}</span>
                        ))}
                </div>
                <Button size="sm" variant="outline" className={styles.viewButton} onClick={() => onClick && onClick(event)}>查看詳情</Button>
            </div>
        </Card>
    );
};

export default EventCard;
