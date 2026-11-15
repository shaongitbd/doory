import { lazy, Suspense } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { LocaleView } from '@/i18n/LocaleView'
import { PageLoader } from './PageLoader'
import { RouteErrorPage } from './RouteErrorPage'
import { AuthLayout } from './layouts/AuthLayout'
import { MarketingLayout } from './layouts/MarketingLayout'
import { RootLayout } from './layouts/RootLayout'

const LandingPage = lazy(() => import('@/pages/LandingPage'))
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage'))
const FeaturesPage = lazy(() => import('@/pages/FeaturesPage'))
const FaqPage = lazy(() => import('@/pages/FaqPage'))
const ContactPage = lazy(() => import('@/pages/ContactPage'))
const TemplateDetailPage = lazy(() => import('@/pages/TemplateDetailPage'))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const SignupPage = lazy(() => import('@/pages/auth/SignupPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'))
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'))
const CreatePage = lazy(() => import('@/pages/CreatePage'))
const LocalEditorPage = lazy(() => import('@/pages/LocalEditorPage'))
const DesignEditorPage = lazy(() => import('@/pages/DesignEditorPage'))
const SharedDesignPage = lazy(() => import('@/pages/SharedDesignPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const DashboardLayout = lazy(() => import('@/features/dashboard/DashboardLayout'))
const DashboardHomePage = lazy(() => import('@/pages/dashboard/HomePage'))
const DesignsPage = lazy(() => import('@/pages/dashboard/DesignsPage'))
const DashboardTemplatesPage = lazy(() => import('@/pages/dashboard/TemplatesPage'))
const BrandPage = lazy(() => import('@/pages/dashboard/BrandPage'))
const UploadsPage = lazy(() => import('@/pages/dashboard/UploadsPage'))
const TrashPage = lazy(() => import('@/pages/dashboard/TrashPage'))
const SettingsPage = lazy(() => import('@/pages/dashboard/SettingsPage'))

const page = (element: React.ReactNode) => <Suspense fallback={<PageLoader />}>{element}</Suspense>

/** Route elements are cached by the router. Re-render their UI on language changes without remounting it. */
function localizedView(render: () => React.ReactNode) {
  return <LocaleView render={render} />
}

export const routes: RouteObject[] = [
  {
    element: localizedView(() => <RootLayout />),
    errorElement: localizedView(() => <RouteErrorPage />),
    children: [
      {
        element: localizedView(() => <MarketingLayout />),
        children: [
          { index: true, element: localizedView(() => <LandingPage />) },
          { path: 'templates', element: localizedView(() => <TemplatesPage />) },
          { path: 'templates/:slug', element: localizedView(() => <TemplateDetailPage />) },
          { path: 'features', element: localizedView(() => <FeaturesPage />) },
          { path: 'faq', element: localizedView(() => <FaqPage />) },
          { path: 'contact', element: localizedView(() => <ContactPage />) },
          { path: '*', element: localizedView(() => <NotFoundPage />) },
        ],
      },
      {
        element: localizedView(() => <AuthLayout />),
        children: [
          { path: 'login', element: localizedView(() => <LoginPage />) },
          { path: 'signup', element: localizedView(() => <SignupPage />) },
          { path: 'forgot-password', element: localizedView(() => <ForgotPasswordPage />) },
          { path: 'reset-password', element: localizedView(() => <ResetPasswordPage />) },
          { path: 'verify-email', element: localizedView(() => <VerifyEmailPage />) },
        ],
      },
      { path: 'create', element: localizedView(() => page(<CreatePage />)) },
      { path: 'local/:localId', element: localizedView(() => page(<LocalEditorPage />)) },
      { path: 's/:token', element: localizedView(() => page(<SharedDesignPage />)) },
      { element: localizedView(() => <RequireAuth keepOpenWhenSessionEnds />), children: [{ path: 'design/:id', element: localizedView(() => page(<DesignEditorPage />)) }] },
      {
        element: localizedView(() => <RequireAuth />),
        children: [
          {
            element: localizedView(() => page(<DashboardLayout />)),
            children: [
              { path: 'dashboard', element: localizedView(() => <DashboardHomePage />) },
              { path: 'dashboard/designs', element: localizedView(() => <DesignsPage />) },
              { path: 'dashboard/designs/folder/:folderId', element: localizedView(() => <DesignsPage />) },
              { path: 'dashboard/starred', element: localizedView(() => <DesignsPage starred />) },
              { path: 'dashboard/templates', element: localizedView(() => <DashboardTemplatesPage />) },
              { path: 'dashboard/brand', element: localizedView(() => <BrandPage />) },
              { path: 'dashboard/uploads', element: localizedView(() => <UploadsPage />) },
              { path: 'dashboard/trash', element: localizedView(() => <TrashPage />) },
              { path: 'settings', element: localizedView(() => <SettingsPage />) },
            ],
          },
        ],
      },
      { path: 'dashboard/*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]
