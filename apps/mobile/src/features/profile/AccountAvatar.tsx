import { useState } from 'react';
import { Image, View } from 'react-native';
import { Copy } from '@/components/ui';
import { usePalette } from '@/theme/usePalette';
import { useMessages } from '@/i18n/useMessages';
import { useAccountAvatar } from './useAccountAvatar';
export function AvatarImage({ url, size = 80 }: { url: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const palette = usePalette(),
    t = useMessages();
  return (
    <View
      style={{
        width: size,
        maxWidth: '100%',
        aspectRatio: 1,
        borderRadius: size / 2,
        backgroundColor: palette.selected,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          style={{ width: '100%', height: '100%' }}
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
