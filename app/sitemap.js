export default function sitemap() {
    return [
        {
            url: 'https://blood-donation-helper.vercel.app',
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1,
        },
        {
            url: 'https://blood-donation-helper.vercel.app/map',
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.8,
        },
    ];
}
