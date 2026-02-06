import {
    Box,
    Card,
    CardContent,
    Typography,
    Avatar,
    Chip,
    Divider,
} from '@mui/material';
import { TrendingUp, TrendingDown, CheckCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Balance } from '@/types';

interface SettlementBalancesProps {
    balances: Balance[];
}

export default function SettlementBalances({ balances }: SettlementBalancesProps) {
    const t = useTranslations('settlement');

    return (
        <Card elevation={2}>
            <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                    {t('perPerson')}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {balances.map((balance) => (
                        <Card
                            key={balance.userId}
                            elevation={0}
                            sx={{ border: '1px solid', borderColor: 'divider' }}
                        >
                            <CardContent>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-start',
                                        mb: 1,
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                                            {balance.username.charAt(0)}
                                        </Avatar>
                                        <Typography variant="subtitle1" fontWeight={600}>
                                            {balance.username}
                                        </Typography>
                                    </Box>
                                    <Chip
                                        icon={
                                            balance.balance > 0 ? (
                                                <TrendingUp size={18} />
                                            ) : balance.balance < 0 ? (
                                                <TrendingDown size={18} />
                                            ) : (
                                                <CheckCircle size={18} />
                                            )
                                        }
                                        label={`${balance.balance >= 0 ? '+' : ''}$${balance.balance.toFixed(0)}`}
                                        color={
                                            balance.balance > 0
                                                ? 'success'
                                                : balance.balance < 0
                                                    ? 'error'
                                                    : 'default'
                                        }
                                        sx={{ fontWeight: 700 }}
                                    />
                                </Box>
                                <Divider sx={{ my: 1.5 }} />
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" color="text.secondary">
                                            {t('totalPaid')}
                                        </Typography>
                                        <Typography variant="body2" fontWeight={500}>
                                            ${balance.totalPaid.toLocaleString()}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" color="text.secondary">
                                            {t('totalOwed')}
                                        </Typography>
                                        <Typography variant="body2" fontWeight={500}>
                                            ${balance.totalOwed.toLocaleString()}
                                        </Typography>
                                    </Box>
                                    <Divider sx={{ my: 0.5 }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" fontWeight={600}>
                                            {t('status')}
                                        </Typography>
                                        <Typography
                                            variant="body2"
                                            fontWeight={600}
                                            color={
                                                balance.balance > 0
                                                    ? 'success.main'
                                                    : balance.balance < 0
                                                        ? 'error.main'
                                                        : 'text.secondary'
                                            }
                                        >
                                            {balance.balance > 0
                                                ? t('shouldReceive')
                                                : balance.balance < 0
                                                    ? t('shouldPay')
                                                    : t('settled')}
                                        </Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    ))}
                </Box>
            </CardContent>
        </Card>
    );
}
