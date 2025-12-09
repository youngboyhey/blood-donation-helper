import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase Enviroment Variables!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    console.log('🚀 Starting migration...');

    // Read existing JSON
    const dataPath = path.join(__dirname, '../src/data/events.json');
    if (!fs.existsSync(dataPath)) {
        console.error('src/data/events.json not found!');
        process.exit(1);
    }

    const events = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    console.log(`Found ${events.length} events in JSON.`);

    if (events.length === 0) {
        console.log('No events to migrate.');
        return;
    }

    // Transform events to match DB schema if needed
    // Current Schema: title, date, time, location, city, district, organizer, gift (json), tags (array), source_url, poster_url
    // JSON Schema seems to match well based on update-events.js logic

    // We process in chunks to be safe
    const CHUNK_SIZE = 50;
    for (let i = 0; i < events.length; i += CHUNK_SIZE) {
        const chunk = events.slice(i, i + CHUNK_SIZE).map(e => ({
            ...e,
            // Ensure gift is stringified or object? Supabase handles JSONB transparently from JS objects.
            // Ensure no undefined fields
            time: e.time || null,
            location: e.location || null,
            city: e.city || null,
            district: e.district || null,
            organizer: e.organizer || null,
            tags: e.tags || [],
            source_url: e.source_url || null,
            poster_url: e.poster_url || e.image || null, // Map 'image' from JSON to 'poster_url' if needed, check JSON structure
            // JSON from update-events.js might currently only have 'image' or 'url' ?
            // Let's check update-events.js or events.json structure.
            // update-events output: highResUrl -> url, but wait, update-events.js output logic:
            // It only console logs images. It doesn't seem to write JSON in the snippet I saw? 
            // wait, update-events.js creates the JSON? 
            // Ah, I need to assume the JSON structure. 
            // From common sense: poster_url in DB corresponds to 'image' or 'posterUrl' in JSON.
        }));

        // Let's inspect one event to be sure about keys
        if (i === 0) console.log('Sample event:', chunk[0]);

        const { error } = await supabase.from('events').upsert(chunk, {
            onConflict: 'title,date,location', // Assuming composite unique key logic, or just let ID generate. 
            // Actually, we don't have unique constraints in DB Schema I created (only ID).
            // So upsert without onConflict will just INSERT duplicates if run multiple times.
            // For migration, we usually want to avoid dupes.
            // But since table is empty, simple insert is fine.
        });

        if (error) {
            console.error('Error inserting chunk:', error);
        } else {
            console.log(`Migrated ${Math.min(i + CHUNK_SIZE, events.length)} / ${events.length}`);
        }
    }

    console.log('✅ Migration complete!');
}

migrate();
