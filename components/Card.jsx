import React from 'react';
import styles from './Card.module.css';

const Card = ({ children, className = '', hoverable = false, ...props }) => {
    const cardClass = `${styles.card} ${hoverable ? styles.hoverable : ''} ${className}`;

    return (
        <div className={cardClass} {...props}>
            {children}
        </div>
    );
};

export default Card;
