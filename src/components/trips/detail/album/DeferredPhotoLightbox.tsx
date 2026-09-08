'use client';

import type { ComponentProps } from 'react';
import type { PhotoLightbox as PhotoLightboxView } from './PhotoLightbox';
import { lazyDialog } from '@/components/common/lazyDialog';

type Props = ComponentProps<typeof PhotoLightboxView>;
const View = lazyDialog(async () => {
  const { PhotoLightbox } = await import('./PhotoLightbox');
  return {
    default: function Lightbox(props: Props & { open: boolean; onClose: () => void }) {
      return <PhotoLightbox {...props} />;
    },
  };
});

export function PhotoLightbox(props: Props) {
  return <View {...props} open={props.index !== null} onClose={() => props.onIndexChange(null)} />;
}
