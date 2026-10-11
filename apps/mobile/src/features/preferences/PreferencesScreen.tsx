import { Action, Chip, Copy, Notice, Page, Section } from '@/components/ui';
import { PageHeader } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { useMessages } from '@/i18n/useMessages';
import { usePreferences } from './context';
import type { Preferences } from './store';

export function PreferencesScreen() {
  const t = useMessages();
  const { value, loaded, busy, error, store } = usePreferences();
  const languages: [Preferences['language'], string][] = [
    ['system', t.preferenceSystem],
    ['zh', '繁體中文'],
    ['zh-CN', '简体中文'],
    ['en', 'English'],
    ['jp', '日本語'],
  ];
  const themes: [Preferences['appearance'], string][] = [
    ['system', t.preferenceSystem],
    ['light', t.preferenceLight],
    ['dark', t.preferenceDark],
  ];
  return (
    <Page>
      <PageHeader title={t.preferences} backLabel={t.backShort} onBack={() => goBack('/')} />
      <Copy>{t.preferenceScope}</Copy>
      {error && (
        <Notice tone="warning" announce="polite">
          {error === 'load' ? t.preferenceLoadError : t.preferenceSaveError}
        </Notice>
      )}
      {!loaded && (
        <Action
          label={t.retry}
          busy={busy}
          onPress={() => void store.reload()}
          testID="preferences-retry"
        />
      )}
      <Section title={t.preferenceLanguage}>
        {languages.map(([language, label]) => (
          <Chip
            key={language}
            label={label}
            selected={value.language === language}
            disabled={busy || !loaded}
            testID={`preference-language-${language}`}
            onPress={() => void store.update({ language })}
          />
        ))}
      </Section>
      <Section title={t.preferenceAppearance}>
        {themes.map(([appearance, label]) => (
          <Chip
            key={appearance}
            label={label}
            selected={value.appearance === appearance}
            disabled={busy || !loaded}
            testID={`preference-appearance-${appearance}`}
            onPress={() => void store.update({ appearance })}
          />
        ))}
      </Section>
      <Action
        variant="secondary"
        label={t.preferenceReset}
        busy={busy}
        testID="preferences-reset"
        onPress={() => void store.reset()}
      />
      <Copy>{t.preferenceResetHint}</Copy>
    </Page>
  );
}
