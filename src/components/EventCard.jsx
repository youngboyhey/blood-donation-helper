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
                {event.posterUrl && (
                    <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.posterLink} onClick={(e) => e.stopPropagation()}>
                        <img src={event.posterUrl} alt="活動海報" className={styles.posterThumbnail} />
                    </a>
                )}
            </div>
            <h3 className={styles.title}>{title}</h3>
            <div className={styles.meta}>
                <span className={styles.time}>{time}</span>
                <span className={styles.location}>{location}</span>
            </div>

            <div className={styles.giftSection}>
                <div className={styles.giftLabel}>贈品亮點</div>
                <div className={styles.giftContent}>
                    <span className={styles.giftName}>{gift.name}</span>
                </div>
                <div className={styles.giftQuantity}>數量: {gift.quantity}</div>
            </div>

            <div className={styles.footer}>
                <div className={styles.tags}>
                    {tags.map((tag, index) => (
                        <span key={index} className={styles.tag}>#{tag}</span>
                    ))}
                </div>
                <Button size="sm" variant="outline" onClick={() => onClick && onClick(event)}>查看詳情</Button>
            </div>
        </Card>
    );
};

export default EventCard;
