import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import CompaniesPage from './pages/Companies';
import CompanyDetailPage from './pages/CompanyDetail';
import ContactsPage from './pages/Contacts';
import ContactDetailPage from './pages/ContactDetail';
import PipelinePage from './pages/Pipeline';
import ActivitiesPage from './pages/Activities';
import DocumentsPage from './pages/Documents';
import DocumentEditorPage from './pages/DocumentEditor';
import DocumentViewPage from './pages/DocumentView';
import UsersPage from './pages/Users';
import CollectionsPage from './pages/Collections';
import ProductsPage from './pages/Products';
import SettingsPage from './pages/Settings';

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === 'ADMIN' ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner className="h-full" />;
  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="companies/:id" element={<CompanyDetailPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:id" element={<ContactDetailPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="activities" element={<ActivitiesPage />} />
        <Route path="documents/quotes" element={<DocumentsPage type="QUOTE" />} />
        <Route path="documents/invoices" element={<DocumentsPage type="INVOICE" />} />
        <Route path="documents/new/:type" element={<DocumentEditorPage />} />
        <Route path="documents/:id/edit" element={<DocumentEditorPage />} />
        <Route path="documents/:id" element={<DocumentViewPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route
          path="users"
          element={
            <AdminOnly>
              <UsersPage />
            </AdminOnly>
          }
        />
        <Route
          path="settings"
          element={
            <AdminOnly>
              <SettingsPage />
            </AdminOnly>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
