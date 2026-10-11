import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import { sizing } from '@/theme/tokens';

export type IconName =
  | 'bed'
  | 'train'
  | 'utensils'
  | 'shopping-bag'
  | 'sparkles'
  | 'ticket'
  | 'receipt'
  | 'camera'
  | 'menu'
  | 'map-pin'
  | 'plus'
  | 'user'
  | 'chevron-left'
  | 'chevron-right'
  | 'user-plus'
  | 'check'
  | 'alert'
  | 'info'
  | 'spinner';

type Segment = readonly [number, number, number, number];
const paths: Partial<Record<IconName, readonly Segment[]>> = {
  bed: [
    [2, 4, 2, 18],
    [2, 12, 18, 12],
    [18, 8, 18, 18],
    [2, 8, 7, 8],
    [7, 8, 7, 12],
    [7, 8, 18, 8],
  ],
  train: [
    [4, 2, 16, 2],
    [16, 2, 16, 15],
    [16, 15, 4, 15],
    [4, 15, 4, 2],
    [4, 9, 16, 9],
    [10, 2, 10, 9],
    [6, 15, 3, 19],
    [14, 15, 17, 19],
    [6, 12, 7, 12],
    [13, 12, 14, 12],
  ],
  utensils: [
    [3, 1, 3, 6],
    [6, 1, 6, 19],
    [9, 1, 9, 6],
    [3, 6, 9, 6],
    [17, 1, 13, 9],
    [13, 9, 17, 9],
    [17, 1, 17, 19],
  ],
  'shopping-bag': [
    [3, 7, 17, 7],
    [17, 7, 18, 18],
    [18, 18, 2, 18],
    [2, 18, 3, 7],
    [6, 7, 6, 3],
    [6, 3, 14, 3],
    [14, 3, 14, 7],
  ],
  sparkles: [
    [8, 2, 10, 7],
    [10, 7, 15, 9],
    [15, 9, 10, 11],
    [10, 11, 8, 16],
    [8, 16, 6, 11],
    [6, 11, 1, 9],
    [1, 9, 6, 7],
    [6, 7, 8, 2],
    [16, 1, 16, 5],
    [14, 3, 18, 3],
    [17, 14, 17, 18],
    [15, 16, 19, 16],
  ],
  ticket: [
    [2, 4, 18, 4],
    [18, 4, 18, 8],
    [18, 8, 15, 10],
    [15, 10, 18, 12],
    [18, 12, 18, 16],
    [18, 16, 2, 16],
    [2, 16, 2, 12],
    [2, 12, 5, 10],
    [5, 10, 2, 8],
    [2, 8, 2, 4],
    [12, 6, 12, 8],
    [12, 12, 12, 14],
  ],
  receipt: [
    [3, 2, 17, 2],
    [17, 2, 17, 18],
    [17, 18, 13, 16],
    [13, 16, 10, 18],
    [10, 18, 7, 16],
    [7, 16, 3, 18],
    [3, 18, 3, 2],
    [6, 6, 14, 6],
    [6, 10, 14, 10],
  ],
  menu: [
    [3, 5, 17, 5],
    [3, 10, 17, 10],
    [3, 15, 17, 15],
  ],
  'map-pin': [
    [6, 12, 10, 18],
    [10, 18, 14, 12],
  ],
  plus: [
    [3, 10, 17, 10],
    [10, 3, 10, 17],
  ],
  'chevron-left': [
    [12, 4, 6, 10],
    [6, 10, 12, 16],
  ],
  'chevron-right': [
    [7, 4, 13, 10],
    [13, 10, 7, 16],
  ],
  'user-plus': [
    [14, 8, 20, 8],
    [17, 5, 17, 11],
  ],
  check: [
    [3, 10, 8, 15],
    [8, 15, 17, 5],
  ],
  alert: [
    [10, 2, 1, 18],
    [1, 18, 19, 18],
    [19, 18, 10, 2],
    [10, 7, 10, 11],
  ],
  info: [[10, 9, 10, 14]],
};

/** Decorative native outlines: their owning control supplies the translated accessible label. */
export function Icon({ name, color }: { name: IconName; color: string }) {
  const stroke = sizing.iconStroke;
  const outline = (style: ViewStyle) => (
    <View style={[{ position: 'absolute', borderWidth: stroke, borderColor: color }, style]} />
  );
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: sizing.icon, height: sizing.icon, flexShrink: 0 }}
    >
      {name === 'spinner' ? (
        <ActivityIndicator size="small" color={color} style={{ width: 20, height: 20 }} />
      ) : (
        <>
          {(paths[name] ?? []).map(([x1, y1, x2, y2], index) => {
            const width = Math.hypot(x2 - x1, y2 - y1);
            return (
              <View
                key={index}
                style={{
                  position: 'absolute',
                  left: (x1 + x2 - width) / 2,
                  top: (y1 + y2 - stroke) / 2,
                  width,
                  height: stroke,
                  borderRadius: stroke / 2,
                  backgroundColor: color,
                  transform: [{ rotate: `${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI}deg` }],
                }}
              />
            );
          })}
          {name === 'map-pin' && (
            <>
              {outline({ left: 4, top: 1, width: 12, height: 12, borderRadius: 6 })}
              {outline({ left: 8, top: 5, width: 4, height: 4, borderRadius: 2 })}
            </>
          )}
          {name === 'camera' && (
            <>
              {outline({ left: 1, top: 5, width: 18, height: 13, borderRadius: 3 })}
              {outline({ left: 6, top: 1, width: 8, height: 6, borderRadius: 2 })}
              {outline({ left: 6, top: 8, width: 8, height: 8, borderRadius: 4 })}
            </>
          )}
          {(name === 'user' || name === 'user-plus') && (
            <>
              {outline({ left: 6, top: 1, width: 8, height: 8, borderRadius: 4 })}
              {outline({
                left: 3,
                top: 12,
                width: 14,
                height: 7,
                borderTopLeftRadius: 7,
                borderTopRightRadius: 7,
                borderBottomWidth: 0,
              })}
            </>
          )}
          {name === 'info' && outline({ left: 1, top: 1, width: 18, height: 18, borderRadius: 9 })}
          {(name === 'info' || name === 'alert') && (
            <View
              style={{
                position: 'absolute',
                left: 9,
                top: name === 'info' ? 5 : 14,
                width: stroke,
                height: stroke,
                borderRadius: stroke / 2,
                backgroundColor: color,
              }}
            />
          )}
        </>
      )}
    </View>
  );
}
