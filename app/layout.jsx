import './globals.css';
import { AuthProvider } from '../context/AuthContext';

export const metadata = {
    title: '捐血小幫手 - 查詢台灣捐血活動與贈品',
    description: '即時查詢台灣各地捐血活動、捐血車位置與豐富贈品資訊，找到離你最近的捐血點。',
    keywords: '捐血,捐血活動,捐血車,捐血站,台灣捐血,捐血贈品',
    openGraph: {
        title: '捐血小幫手',
        description: '即時查詢台灣各地捐血活動、捐血車位置與贈品資訊',
        type: 'website',
        locale: 'zh_TW',
    },
};

export default function RootLayout({ children }) {
    return (
        <html lang="zh-TW">
            <body>
                <AuthProvider>
                    {children}
                </AuthProvider>
            </body>
        </html>
    );
}
