import HomeClient from '../components/HomeClient';

// ✅ SEO 核心：在伺服器端抓取 Supabase 資料，Google 爬蟲能讀到資料
export const metadata = {
    title: '捐血小幫手 - 查詢台灣捐血活動與贈品',
    description: '即時查詢台灣各地捐血活動、捐血車位置與豐富贈品資訊，找到離你最近的捐血點。',
};

// 每 60 秒重新驗證（ISR - 增量靜態再生）
export const revalidate = 60;

async function getEvents() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // 若環境變數未設定（例如 build 時），回傳空陣列，避免 pre-render 崩潰
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
        console.warn('Supabase env vars not set, returning empty events for build');
        return [];
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .gte('date', today)
            .order('date', { ascending: true });

        if (error) {
            console.error('Error fetching events:', error);
            return [];
        }
        return data || [];
    } catch (err) {
        console.error('Error fetching events:', err);
        return [];
    }
}

export default async function HomePage() {
    const events = await getEvents();
    return <HomeClient initialEvents={events} />;
}
