import { useCallback, useEffect, useState } from 'react';
import GameApp from './GameApp';
import PackEditorPage from './components/PackEditorPage';
import VersionBadge from './components/VersionBadge';
import './index.css';
import { navigate, parseRoute, type AppRoute } from './lib/navigation';

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const handleRouteChange = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  const openPackEditor = useCallback((packId: string) => {
    navigate(`/packs/${encodeURIComponent(packId)}/edit`);
  }, []);

  const openGame = useCallback(() => {
    navigate('/');
  }, []);

  if (route.type === 'pack-editor') {
    return (
      <>
        <PackEditorPage
          packId={route.packId}
          onBack={openGame}
          onOpenPack={openPackEditor}
        />
        <VersionBadge />
      </>
    );
  }

  return (
    <>
      <GameApp onOpenPackEditor={openPackEditor} />
      <VersionBadge />
    </>
  );
}
