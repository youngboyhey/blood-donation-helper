-- 新增經緯度欄位用於地圖功能
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS longitude double precision;

-- 建立索引以加速地理查詢
CREATE INDEX IF NOT EXISTS events_coordinates_idx ON public.events (latitude, longitude);
