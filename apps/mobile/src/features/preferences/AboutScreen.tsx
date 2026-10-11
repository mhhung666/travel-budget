import { useState } from 'react';
import { Linking } from 'react-native';
import { Action, Card, Copy, DetailRow, Notice, Page } from '@/components/ui';
import { PageHeader } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { useMessages } from '@/i18n/useMessages';
import { version } from '../../../package.json';
import { websiteUrl } from './website';

export function AboutScreen() {
  const t = useMessages();
  const [linkFailed, setLinkFailed] = useState(false);
  const [opening, setOpening] = useState(false);
  const url = websiteUrl(
    process.env.EXPO_PUBLIC_API_BASE_URL,
    process.env.EXPO_PUBLIC_WEB_ORIGIN,
    __DEV__
  );
  return (
    <Page>
      <PageHeader title={t.preferenceAbout} backLabel={t.backShort} onBack={() => goBack('/me')} />
      <Card>
        <Copy>Travel Budget</Copy>
        <DetailRow label={t.preferenceVersion} value={version} />
      </Card>
      <Copy>{t.preferenceWebsiteHint}</Copy>
      {!url && <Notice>{t.preferenceWebsiteUnavailable}</Notice>}
      {linkFailed && <Notice tone="warning">{t.preferenceLinkError}</Notice>}
      <Action
        variant="secondary"
        label={t.preferenceWebsite}
        disabled={!url}
        busy={opening}
        testID="preferences-website"
        onPress={() => {
          if (!url || opening) return;
          setLinkFailed(false);
          setOpening(true);
          void Linking.openURL(url)
            .catch(() => setLinkFailed(true))
            .finally(() => setOpening(false));
        }}
      />
    </Page>
  );
}
