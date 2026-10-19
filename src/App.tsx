import { AdminPanel } from './admin-panel';
import { RouletteViewHook } from './roulette-view-hook';
import './App.css';

function App() {
  const path = window.location.pathname;

  if (path.startsWith('/admin')) {
    return <AdminPanel />;
  }
  if (path.startsWith('/roulette-hook')) {
    return <RouletteViewHook />;
  }

  return <RouletteViewHook />;
}

export default App;
