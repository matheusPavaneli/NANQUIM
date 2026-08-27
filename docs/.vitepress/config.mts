import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
  defineConfig({
    title: 'NANQUIM',
    description: 'NANQUIM — embeddable Pix checkout SDK, provider-agnostic, zero runtime dependencies.',
    lang: 'en-US',
    base: '/NANQUIM/',
    cleanUrls: true,
    lastUpdated: true,
    head: [['meta', { name: 'theme-color', content: '#0e7c71' }]],

    themeConfig: {
      siteTitle: 'NANQUIM',

      nav: [
        { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
        { text: 'Reference', link: '/reference/core', activeMatch: '/reference/' },
        { text: 'Architecture', link: '/architecture/security', activeMatch: '/architecture/' },
        { text: '0.1.0', items: [{ text: 'Changelog', link: '/architecture/budget' }] },
      ],

      sidebar: [
        {
          text: 'Guide',
          collapsed: false,
          items: [
            { text: 'What this is', link: '/guide/' },
            { text: 'Quickstart', link: '/guide/quickstart' },
            { text: 'The backend contract', link: '/guide/backend' },
            { text: 'React', link: '/guide/react' },
            { text: 'CDN / no bundler', link: '/guide/cdn' },
            { text: 'Theming', link: '/guide/theming' },
            { text: 'Localization', link: '/guide/i18n' },
            { text: 'Production checklist', link: '/guide/production' },
          ],
        },
        {
          text: 'Reference',
          collapsed: false,
          items: [
            { text: '@nanquim/core', link: '/reference/core' },
            { text: '@nanquim/react', link: '/reference/react' },
            { text: '@nanquim/server', link: '/reference/server' },
            { text: 'Provider contract', link: '/reference/provider' },
            { text: 'Errors', link: '/reference/errors' },
          ],
        },
        {
          text: 'Architecture',
          collapsed: false,
          items: [
            { text: 'Security model', link: '/architecture/security' },
            { text: 'State graph', link: '/statechart' },
            { text: 'Budget & testing', link: '/architecture/budget' },
          ],
        },
      ],

      outline: { level: [2, 3], label: 'On this page' },
      socialLinks: [{ icon: 'github', link: 'https://github.com/matheusPavaneli/NANQUIM' }],
      search: { provider: 'local' },
      editLink: {
        pattern: 'https://github.com/matheusPavaneli/NANQUIM/edit/main/docs/:path',
        text: 'Edit this page on GitHub',
      },
      footer: {
        message: 'MIT licensed. The browser is never the source of truth.',
        copyright: '© 2026 NANQUIM',
      },
    },
  }),
);
