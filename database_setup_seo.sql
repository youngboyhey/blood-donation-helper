-- SEO Settings Table
-- Run this in Supabase SQL Editor to create the table

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default SEO settings
INSERT INTO settings (key, value) VALUES 
('seo', '{
    "title": "捐血小幫手 - 查詢捐血活動與贈品",
    "description": "捐血小幫手 - 查詢全台捐血活動、地點與豐富贈品資訊。即時掌握最新捐血好康，一起熱血助人！",
    "keywords": "捐血, 捐血活動, 捐血贈品, 捐血地點, 台北捐血, 台中捐血, 高雄捐血",
    "ogImage": ""
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Allow public read" ON settings FOR SELECT USING (true);

-- Allow authenticated users to update
CREATE POLICY "Allow authenticated update" ON settings FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated insert" ON settings FOR INSERT WITH CHECK (true);
