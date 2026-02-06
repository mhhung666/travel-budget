import { useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Avatar,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from '@mui/material';
import { ArrowRight, ArrowDown, Lightbulb } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Transaction } from '@/types';

interface SettlementPlanProps {
    transactions: Transaction[];
    exchangeRates: Record<string, number>;
    loadingRates: boolean;
}

export default function SettlementPlan({
    transactions,
    exchangeRates,
    loadingRates,
}: SettlementPlanProps) {
    const t = useTranslations('settlement');
    const [selectedCurrency, setSelectedCurrency] = useState('TWD');

    const convertAmount = (amount: number): number => {
        if (selectedCurrency === 'TWD') return amount;
        const rate = exchangeRates[selectedCurrency];
        return rate ? amount / rate : amount;
    };

    const formatAmount = (amount: number): string => {
        const converted = convertAmount(amount);
        return converted.toFixed(selectedCurrency === 'JPY' ? 0 : 2);
    };

    return (
        <Card elevation={2}>
            <CardContent>
                <Box
                    sx={{
                        mb: 2,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 2,
                    }}
                >
                    <Box>
                        <Typography variant="h6" fontWeight={600} component="span">
                            {t('plan')}
                        </Typography>
                        {transactions.length > 0 && (
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                component="span"
                                sx={{ ml: 1 }}
                            >
                                ({transactions.length} {t('transferCount')})
                            </Typography>
                        )}
                    </Box>
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>{t('currency')}</InputLabel>
                        <Select
                            value={selectedCurrency}
                            label={t('currency')}
                            onChange={(e) => setSelectedCurrency(e.target.value)}
                            disabled={loadingRates}
                        >
                            <MenuItem value="TWD">TWD</MenuItem>
                            <MenuItem value="JPY">JPY</MenuItem>
                            <MenuItem value="USD">USD</MenuItem>
                            <MenuItem value="EUR">EUR</MenuItem>
                            <MenuItem value="HKD">HKD</MenuItem>
                        </Select>
                    </FormControl>
                </Box>

                {transactions.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                        <Typography variant="h5" gutterBottom>
                            🎉 {t('great')}
                        </Typography>
                        <Typography variant="body1" color="text.secondary">
                            {t('noTransfers')}
                        </Typography>
                    </Box>
                ) : (
                    <Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {transactions.map((transaction, index) => (
                                <Card
                                    key={index}
                                    elevation={0}
                                    sx={{
                                        background: 'linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%)',
                                        border: '2px solid',
                                        borderColor: 'warning.light',
                                    }}
                                >
                                    <CardContent sx={{ p: '16px !important' }}>
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                flexDirection: { xs: 'column', sm: 'row' },
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: { xs: 1, sm: 2 },
                                                width: '100%',
                                            }}
                                        >
                                            {/* Payer */}
                                            <Box
                                                sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 1.5,
                                                    width: { xs: '100%', sm: 'auto' },
                                                    justifyContent: { xs: 'center', sm: 'flex-start' },
                                                }}
                                            >
                                                <Avatar
                                                    sx={{
                                                        bgcolor: 'error.main',
                                                        color: 'white',
                                                        border: '2px solid',
                                                        borderColor: 'error.dark',
                                                    }}
                                                >
                                                    {transaction.from.charAt(0)}
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
                                                        {t('payer')}
                                                    </Typography>
                                                    <Typography
                                                        variant="body1"
                                                        fontWeight={600}
                                                        sx={{ color: 'rgba(0, 0, 0, 0.87)' }}
                                                    >
                                                        {transaction.from}
                                                    </Typography>
                                                </Box>
                                            </Box>

                                            {/* Amount & Arrow */}
                                            <Box sx={{ my: { xs: 1, sm: 0 }, textAlign: 'center' }}>
                                                <Typography variant="h5" fontWeight={700} color="warning.dark">
                                                    {selectedCurrency} {formatAmount(transaction.amount)}
                                                </Typography>
                                                {selectedCurrency !== 'TWD' && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        (TWD ${transaction.amount.toFixed(0)})
                                                    </Typography>
                                                )}
                                                <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
                                                    <Box component="span" sx={{ color: 'text.secondary', display: 'flex' }}>
                                                        <ArrowDown />
                                                    </Box>
                                                </Box>
                                                <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                                                    <Box component="span" sx={{ color: 'text.secondary', display: 'flex' }}>
                                                        <ArrowRight />
                                                    </Box>
                                                </Box>
                                            </Box>

                                            {/* Payee */}
                                            <Box
                                                sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 1.5,
                                                    width: { xs: '100%', sm: 'auto' },
                                                    justifyContent: { xs: 'center', sm: 'flex-end' },
                                                }}
                                            >
                                                <Box sx={{ textAlign: 'right' }}>
                                                    <Typography variant="caption" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
                                                        {t('payee')}
                                                    </Typography>
                                                    <Typography
                                                        variant="body1"
                                                        fontWeight={600}
                                                        sx={{ color: 'rgba(0, 0, 0, 0.87)' }}
                                                    >
                                                        {transaction.to}
                                                    </Typography>
                                                </Box>
                                                <Avatar
                                                    sx={{
                                                        bgcolor: 'success.main',
                                                        color: 'white',
                                                        border: '2px solid',
                                                        borderColor: 'success.dark',
                                                    }}
                                                >
                                                    {transaction.to.charAt(0)}
                                                </Avatar>
                                            </Box>
                                        </Box>
                                    </CardContent>
                                </Card>
                            ))}
                        </Box>

                        <Alert severity="info" icon={<Lightbulb />} sx={{ mt: 3 }}>
                            <strong>{t('tip')}</strong>{' '}
                            {t('tipContent')}
                        </Alert>
                    </Box>
                )}
            </CardContent>
        </Card>
    );
}
