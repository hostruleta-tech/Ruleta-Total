import { AdminPanel } from './admin-panel';
import { RouletteView } from './roulette-view';
import './App.css';

function App() {
  const path = window.location.pathname;

  if (path.startsWith('/admin')) {
    return <AdminPanel />;
  }

  return <RouletteView />;
}

export default App;
