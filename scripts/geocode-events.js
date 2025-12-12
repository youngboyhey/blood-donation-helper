/**
 * 補齊現有活動的經緯度
 * 使用 Google Geocoding API 將地址轉換為經緯度
 * 
 * 使用方式: node scripts/geocode-events.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const GOOGLE_MAPS_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE credentials');
    process.exit(1);
}

if (!GOOGLE_MAPS_API_KEY) {
    console.error('Missing VITE_GOOGLE_MAPS_API_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * 使用 Google Geocoding API 將地址轉換為經緯度
 */
async function geocodeAddress(address) {
    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW&region=tw`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.results.length > 0) {
            const location = data.results[0].geometry.location;
            return {
                latitude: location.lat,
                longitude: location.lng
            };
        } else if (data.status === 'ZERO_RESULTS') {
            console.log(`  [Geocode] 找不到地址: ${address}`);
            return null;
        } else {
            console.log(`  [Geocode] API 錯誤: ${data.status} - ${data.error_message || ''}`);
            return null;
        }
    } catch (error) {
        console.error(`  [Geocode] 請求失敗: ${error.message}`);
        return null;
    }
}

/**
 * 組合完整地址
 */
function buildFullAddress(event) {
    const parts = [];
    if (event.city) parts.push(event.city);
    if (event.district) parts.push(event.district);
    if (event.location) parts.push(event.location);
    return parts.join('');
}

async function main() {
    console.log('=== 開始補齊活動經緯度 ===\n');

    // 取得所有沒有經緯度的活動
    const { data: events, error } = await supabase
        .from('events')
        .select('id, title, city, district, location, latitude, longitude')
        .or('latitude.is.null,longitude.is.null');

    if (error) {
        console.error('取得活動失敗:', error.message);
        process.exit(1);
    }

    console.log(`找到 ${events.length} 個需要補齊經緯度的活動\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const fullAddress = buildFullAddress(event);

        console.log(`[${i + 1}/${events.length}] ${event.title}`);
        console.log(`  地址: ${fullAddress}`);

        // Rate limit: 50 requests per second (Google API limit)
        await new Promise(resolve => setTimeout(resolve, 200));

        const coords = await geocodeAddress(fullAddress);

        if (coords) {
            const { error: updateError } = await supabase
                .from('events')
                .update({
                    latitude: coords.latitude,
                    longitude: coords.longitude
                })
                .eq('id', event.id);

            if (updateError) {
                console.log(`  ❌ 更新失敗: ${updateError.message}`);
                failCount++;
            } else {
                console.log(`  ✅ 經緯度: ${coords.latitude}, ${coords.longitude}`);
                successCount++;
            }
        } else {
            failCount++;
        }

        console.log('');
    }

    console.log('=== 完成 ===');
    console.log(`成功: ${successCount}`);
    console.log(`失敗: ${failCount}`);
}

main().catch(console.error);
