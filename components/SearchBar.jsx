import React from 'react';
import Input from './Input';
import Button from './Button';
import styles from './SearchBar.module.css';

const SearchBar = ({ onSearch, placeholder = '搜尋地點、贈品或活動...' }) => {
    const [query, setQuery] = React.useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSearch(query);
    };

    return (
        <form className={styles.searchBar} onSubmit={handleSubmit}>
            <Input
                className={styles.input}
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="submit" variant="primary">搜尋</Button>
        </form>
    );
};

export default SearchBar;
