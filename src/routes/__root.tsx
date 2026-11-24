import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import css from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Eye Academy Voice Viva' }],
    links: [{ rel: 'stylesheet', href: css }],
  }),
  shellComponent: ({ children }: { children: React.ReactNode }) => (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  ),
  component: () => <Outlet />,
})
