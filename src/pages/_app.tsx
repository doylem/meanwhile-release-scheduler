import type { AppProps } from 'next/app';
import Head from 'next/head';
import { APP_NAME } from '../../config/labels.config';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>{APP_NAME}</title>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
