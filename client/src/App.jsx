import { Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth } from './components/RouteGuards.jsx';
import AppLayout from './components/AppLayout.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import SpacePage from './pages/SpacePage.jsx';
import BookletPage from './pages/BookletPage.jsx';
import RevisionPage from './pages/RevisionPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/spaces/:spaceId" element={<SpacePage />} />
          <Route path="/spaces/:spaceId/booklet" element={<BookletPage />} />
          <Route path="/spaces/:spaceId/revision/:unit" element={<RevisionPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
