import type { ReactNode } from 'react';

export const metadata = { title: 'Example checkout — Pix drop-in' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, font: '15px/1.55 system-ui, sans-serif' }}>{children}</body>
    </html>
  );
}
