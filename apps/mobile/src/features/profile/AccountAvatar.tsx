import { useState } from 'react';
import { Image, View } from 'react-native';
import { Copy } from '@/components/ui';
import { usePalette } from '@/theme/usePalette';
import { useMessages } from '@/i18n/useMessages';
import { useAccountAvatar } from './useAccountAvatar';
export function AvatarImage({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  const palette = usePalette(),
    t = useMessages();
  return (
    <View
      style={{
        width: 80,
        minHeight: 80,
        borderRadius: 40,
        backgroundColor: palette.selected,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          style={{ width: 80, height: 80 }}
          accessibilityLabel={t.avatarTitle}
          onError={() => setFailed(true)}
        />
      ) : (
        <Copy>{url && failed ? t.avatarLoadFailed : t.avatarEmpty}</Copy>
      )}
    </View>
  );
}
export function AccountAvatar() {
  const query = useAccountAvatar();
  return (
    <AvatarImage
      key={`${query.data?.avatarUrl ?? 'empty'}:${query.dataUpdatedAt}`}
      url={query.data?.avatarUrl ?? null}
    />
  );
}
