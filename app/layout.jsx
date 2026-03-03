import './globals.css';
import Script from 'next/script';
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

const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_TRACKING_ID;

export default function RootLayout({ children }) {
    return (
        <html lang="zh-TW">
            <body>
                {/* Google Analytics */}
                {GA_TRACKING_ID && (
                    <>
                        <Script
                            src={`https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`}
                            strategy="afterInteractive"
                        />
                        <Script id="google-analytics" strategy="afterInteractive">
                            {`
                                window.dataLayer = window.dataLayer || [];
                                function gtag(){dataLayer.push(arguments);}
                                gtag('js', new Date());
                                gtag('config', '${GA_TRACKING_ID}');
                            `}
                        </Script>
                    </>
                )}
                <AuthProvider>
                    {children}
                </AuthProvider>
            </body>
        </html>
    );
}
