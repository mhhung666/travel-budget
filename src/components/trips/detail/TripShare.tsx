import { Card, CardContent } from '@mui/material';
import { useTranslations } from 'next-intl';
import { ShareCode } from '../ShareCode';

interface TripShareProps {
    tripHashCode: string;
    onCopy: () => void;
}

export default function TripShare({ tripHashCode, onCopy }: TripShareProps) {
    const tTrip = useTranslations('trip');

    return (
        <ShareCode
            hashCode={tripHashCode}
            title={tTrip('share')}
            description={tTrip('shareHint')}
        />
    );
}
