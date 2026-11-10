// Іконки PWA з public/favicon.svg: `npx @vite-pwa/assets-generator`.
// padding 0, бо картинка вже має фон на всю площу і безпечну зону в центрі.
export default {
  preset: {
    transparent: { sizes: [192, 512], favicons: [], padding: 0 },
    maskable: { sizes: [512], padding: 0 },
    apple: { sizes: [180], padding: 0 },
  },
  images: ['public/favicon.svg'],
}
