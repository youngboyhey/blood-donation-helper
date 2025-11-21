import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import styles from './Modal.module.css';
import Button from './Button';

const Modal = ({ isOpen, onClose, title, children }) => {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3 className={styles.title}>{title}</h3>
                    <button className={styles.closeButton} onClick={onClose}>&times;</button>
                </div>
                <div className={styles.content}>
                    {children}
                </div>
                <div className={styles.footer}>
                    <Button variant="secondary" onClick={onClose}>關閉</Button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default Modal;
