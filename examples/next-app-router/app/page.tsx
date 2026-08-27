import { Checkout } from './checkout';

export default function Page() {
  return (
    <main style={{ maxInlineSize: 456, margin: '48px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: 20, letterSpacing: '-0.01em' }}>Annual Plan — Example Store</h1>
      <p style={{ opacity: 0.7, fontSize: 14 }}>
        The charge is created by this app&apos;s server route. No credential exists in the browser.
      </p>
      <div lang="pt-BR">
        <Checkout />
      </div>
    </main>
  );
}
