/**
 * Apply SEO Settings from Supabase to index.html
 * Runs during GitHub Actions build process
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applySeoSettings() {
    console.log('[SEO] Fetching SEO settings from Supabase...');

    const supabase = createClient(
        process.env.VITE_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    );

    // Fetch SEO settings
    const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'seo')
        .single();

    if (error) {
        console.log('[SEO] No settings found in DB, using defaults.');
        return;
    }

    const seo = data.value;
    console.log('[SEO] Settings found:', seo);

    // Read dist/index.html
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');

    if (!fs.existsSync(indexPath)) {
        console.error('[SEO] dist/index.html not found. Build first!');
        return;
    }

    let html = fs.readFileSync(indexPath, 'utf-8');

    // Replace meta tags
    if (seo.title) {
        html = html.replace(
            /<title>.*?<\/title>/,
            `<title>${seo.title}</title>`
        );
    }

    if (seo.description) {
        html = html.replace(
            /<meta name="description" content=".*?" \/>/,
            `<meta name="description" content="${seo.description}" />`
        );
    }

    if (seo.keywords) {
        html = html.replace(
            /<meta name="keywords" content=".*?" \/>/,
            `<meta name="keywords" content="${seo.keywords}" />`
        );
    }

    // Add OG tags if not exist
    if (seo.ogImage && !html.includes('og:image')) {
        const ogTags = `
  <meta property="og:title" content="${seo.title}" />
  <meta property="og:description" content="${seo.description}" />
  <meta property="og:image" content="${seo.ogImage}" />
  <meta property="og:type" content="website" />
</head>`;
        html = html.replace('</head>', ogTags);
    }

    // Write back
    fs.writeFileSync(indexPath, html, 'utf-8');
    console.log('[SEO] ✓ Applied SEO settings to dist/index.html');
}

applySeoSettings().catch(console.error);
