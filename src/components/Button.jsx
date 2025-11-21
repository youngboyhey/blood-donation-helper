import React from 'react';
import styles from './Button.module.css';

const Button = ({ children, variant = 'primary', size = 'md', className = '', ...props }) => {
    const buttonClass = `${styles.button} ${styles[variant]} ${styles[size]} ${className}`;

    return (
        <button className={buttonClass} {...props}>
            {children}
        </button>
    );
};

export default Button;
