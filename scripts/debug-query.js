
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function testQuery() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('Connecting to:', supabaseUrl);
    console.log('Using Key (first 10 chars):', supabaseKey?.substring(0, 10));

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Testing simple select...');
    const { data: simpleData, error: simpleError } = await supabase.from('events').select('*').limit(1);
    if (simpleError) console.error('Simple Select Error:', simpleError);
    else console.log('Simple Select Success:', simpleData?.length);

    console.log('Testing complex select (from update-events.js)...');
    const { data: complexData, error: complexError } = await supabase
        .from('events')
        .select('poster_url, title, city, date')
        .not('poster_url', 'is', null);

    if (complexError) console.error('Complex Select Error:', complexError);
    else console.log('Complex Select Success:', complexData?.length);
}

testQuery();
