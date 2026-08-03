import { ArrowLeft, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface ErrorViewProps {
  error: string;
  onBack: () => void;
}

export default function ErrorView({ error, onBack }: ErrorViewProps) {
  const tCommon = useTranslations('common');
  const tError = useTranslations('error');

  return (
    <section className="w-full border-y py-10 text-center sm:border sm:p-10">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Info className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold">{tCommon('errorTitle')}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
      <Button variant="outline" className="mt-7 w-full" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {tError('goBack')}
      </Button>
    </section>
  );
}
