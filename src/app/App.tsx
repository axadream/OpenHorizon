import { AppShell } from '@/components/layout/AppShell';
import { DevGallery } from '@/app/DevGallery';
import { ErrorBoundary } from '@/app/ErrorBoundary';

export default function App() {
  const gallery = new URLSearchParams(window.location.search).get('gallery') === '1';
  return <ErrorBoundary>{gallery ? <DevGallery /> : <AppShell />}</ErrorBoundary>;
}
