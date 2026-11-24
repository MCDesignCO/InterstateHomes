import type { Metadata } from 'next';
import './globals.css';
import { RoleProvider } from '@/lib/role-context';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Interstate Homes — Estimating, Subcontract & Budget Software',
  description:
    'Internal estimating, subcontractor compliance, purchase orders, and live job cost budget platform for Interstate Homes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=Nunito+Sans:wght@400;600;700&display=swap"
        />
      </head>
      <body>
        <RoleProvider>
          <AppShell>{children}</AppShell>
        </RoleProvider>
      </body>
    </html>
  );
}
