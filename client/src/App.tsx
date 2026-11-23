import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { FullPageSpinner } from './components/ui';
import { FeedbackRoot } from './components/feedback';
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
import RolesPage from './pages/Roles';
import CollectionsPage from './pages/Collections';
import DealDetailPage from './pages/DealDetail';
import ProductsPage from './pages/Products';
import SettingsPage from './pages/Settings';

/** Page réservée aux rôles ayant l'un des droits indiqués ; sinon retour au tableau de bord. */
function Guard({ any, children }: { any: string[]; children: ReactNode }) {
  const { can } = useAuth();
  return any.some(can) ? <>{children}</> : <Navigate to="/" replace />;
}

/** Création de devis ou de facture selon le type dans l'URL. */
function NewDocumentGuard() {
  const { type } = useParams();
  return (
    <Guard any={[type === 'INVOICE' ? 'invoices.create' : 'quotes.create']}>
      <DocumentEditorPage />
    </Guard>
  );
}

const g = (any: string[], el: ReactNode) => <Guard any={any}>{el}</Guard>;

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user)
    return (
      <>
        <LoginPage />
        <FeedbackRoot />
      </>
    );

  const docs = ['quotes.view', 'invoices.view'];
  return (
    <>
      <FeedbackRoot />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="companies" element={g(['companies.view'], <CompaniesPage />)} />
          <Route path="companies/:id" element={g(['companies.view'], <CompanyDetailPage />)} />
          <Route path="contacts" element={g(['contacts.view'], <ContactsPage />)} />
          <Route path="contacts/:id" element={g(['contacts.view'], <ContactDetailPage />)} />
          <Route path="pipeline" element={g(['deals.view'], <PipelinePage />)} />
          <Route path="deals/:id" element={g(['deals.view'], <DealDetailPage />)} />
          <Route path="activities" element={g(['activities.view'], <ActivitiesPage />)} />
          <Route path="documents/quotes" element={g(['quotes.view'], <DocumentsPage type="QUOTE" />)} />
          <Route path="documents/invoices" element={g(['invoices.view'], <DocumentsPage type="INVOICE" />)} />
          <Route path="documents/new/:type" element={<NewDocumentGuard />} />
          <Route path="documents/:id/edit" element={g(['quotes.edit', 'invoices.edit'], <DocumentEditorPage />)} />
          <Route path="documents/:id" element={g(docs, <DocumentViewPage />)} />
          <Route path="collections" element={g(['invoices.view'], <CollectionsPage />)} />
          <Route path="products" element={g(['products.view'], <ProductsPage />)} />
          <Route path="users" element={g(['admin.users'], <UsersPage />)} />
          <Route path="roles" element={g(['admin.roles'], <RolesPage />)} />
          <Route path="settings" element={g(['admin.settings'], <SettingsPage />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
