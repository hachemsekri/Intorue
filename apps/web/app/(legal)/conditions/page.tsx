import type { Metadata } from 'next';
import { LegalPage, legalTitle } from '@/components/home/legal-page';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await legalTitle('terms') };
}

export default function TermsPage() {
  return <LegalPage kind="terms" />;
}
