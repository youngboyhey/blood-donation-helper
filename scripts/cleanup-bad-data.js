import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function cleanupBadEvents() {
    console.log('開始清理無效的圖片資料...');

    // 1. 搜尋 poster_url 以 data:image 開頭的活動
    const { data: badPosterEvents, error: e1 } = await supabase
        .from('events')
        .select('id, location, date')
        .ilike('poster_url', 'data:image%');

    if (e1) console.error('Error finding bad posters:', e1);
    else if (badPosterEvents && badPosterEvents.length > 0) {
        console.log(`找到 ${badPosterEvents.length} 筆 poster_url 為 base64 的活動，準備刪除...`);
        const ids = badPosterEvents.map(e => e.id);
        const { error: delErr } = await supabase.from('events').delete().in('id', ids);
        if (delErr) console.error('Delete failed:', delErr);
        else console.log('✓ 刪除成功');
    } else {
        console.log('✓ 未發現 poster_url 為 base64 的資料');
    }

    // 2. 搜尋 original_image_url 以 data:image 開頭的活動 (選擇性清理，避免隱藏問題)
    const { data: badOrigEvents, error: e2 } = await supabase
        .from('events')
        .select('id, location, date')
        .ilike('original_image_url', 'data:image%');

    if (e2) console.error('Error finding bad originals:', e2);
    else if (badOrigEvents && badOrigEvents.length > 0) {
        console.log(`找到 ${badOrigEvents.length} 筆 original_image_url 為 base64 的活動`);
        // 我們也刪除這些，以確保重新抓取時能拿到正確的 URL (如果有的話)
        const ids = badOrigEvents.map(e => e.id);
        const { error: delErr } = await supabase.from('events').delete().in('id', ids);
        if (delErr) console.error('Delete failed:', delErr);
        else console.log('✓ 刪除成功');
    } else {
        console.log('✓ 未發現 original_image_url 為 base64 的資料');
    }
}

cleanupBadEvents().catch(console.error);
