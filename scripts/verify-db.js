import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase Environment Variables!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log('Verifying connection to:', supabaseUrl);

    // Try to select from events table
    const { data, error } = await supabase.from('events').select('count', { count: 'exact', head: true });

    if (error) {
        if (error.code === '42P01') { // undefined_table
            console.error('❌ Connection successful, BUT table "events" does NOT exist.');
            console.error('👉 Please run the database_setup.sql script in Supabase SQL Editor.');
        } else {
            console.error('❌ Connection failed:', error.message);
        }
        process.exit(1);
    } else {
        console.log('✅ Connection successful!');
        console.log('✅ Table "events" exists.');
        console.log(`📊 Current row count: ${data}`); // data is null for head:true ? No, count is returned in count
        // actually with head:true data is null, count is in count property if returned ?
        // count property is on the response object, not data.
    }
}

verify();
