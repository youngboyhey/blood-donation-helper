import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

let supabaseUrl = process.env.VITE_SUPABASE_URL || '';
let supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

// Sanitization
supabaseUrl = supabaseUrl.trim().replace(/['"]/g, '');
supabaseKey = supabaseKey.trim().replace(/['"]/g, '');

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase Environment Variables!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdmin() {
    const email = 'admin@bloodhelper.com';
    const password = 'Aa88888888';

    console.log(`Creating user: [${email}]...`);

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        console.error('Error creating user:', error.message);
    } else {
        console.log('✅ User created successfully!');
        console.log('Use the following credentials to login:');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);

        if (data.user && !data.session) {
            console.log('⚠️ Note: User created but email confirmation is required.');
            console.log('Please check your email or disable confirmation in Supabase Dashboard.');
        }
    }
}

createAdmin();
