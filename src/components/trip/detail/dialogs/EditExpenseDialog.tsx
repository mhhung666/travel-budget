import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Typography,
    Button
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { CATEGORIES, DEFAULT_CATEGORY } from '@/constants/categories';
import type { Expense } from '@/types';

interface EditExpenseDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<void>;
    expense: Expense | null;
}

export default function EditExpenseDialog({
    open,
    onClose,
    onSubmit,
    expense,
}: EditExpenseDialogProps) {
    const tExpense = useTranslations('expense');
    const tCommon = useTranslations('common');
    const tCurrency = useTranslations('currency');
    const tTrip = useTranslations('trip');
    const t = useTranslations();

    const [error, setError] = useState('');
    const [form, setForm] = useState({
        description: '',
        original_amount: '',
        currency: 'TWD',
        exchange_rate: '1.0',
        category: DEFAULT_CATEGORY,
    });

    useEffect(() => {
        if (open && expense) {
            setForm({
                description: expense.description,
                original_amount: expense.original_amount.toString(),
                currency: expense.currency,
                exchange_rate: expense.exchange_rate.toString(),
                category: expense.category || DEFAULT_CATEGORY,
            });
            setError('');
        }
    }, [open, expense]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!expense) return;
        setError('');
        try {
            await onSubmit(form);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const calculateConvertedAmount = () => {
        const amount = parseFloat(form.original_amount) || 0;
        const rate = parseFloat(form.exchange_rate) || 1;
        return amount * rate;
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <form onSubmit={handleSubmit}>
                <DialogTitle>{tExpense('edit')}</DialogTitle>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <TextField
                        fullWidth
                        label={tExpense('form.description')}
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        margin="normal"
                        required
                    />

                    <FormControl fullWidth margin="normal" required>
                        <InputLabel>{tExpense('form.category')}</InputLabel>
                        <Select
                            value={form.category}
                            onChange={(e) => setForm({ ...form, category: e.target.value })}
                            label={tExpense('form.category')}
                        >
                            {CATEGORIES.map((cat) => (
                                <MenuItem key={cat.code} value={cat.code}>
                                    {cat.icon} {t(cat.nameKey)}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl fullWidth margin="normal" required>
                        <InputLabel>{tExpense('form.currency')}</InputLabel>
                        <Select
                            value={form.currency}
                            onChange={(e) => {
                                const currency = e.target.value;
                                setForm({
                                    ...form,
                                    currency,
                                    exchange_rate: currency === 'TWD' ? '1.0' : form.exchange_rate,
                                });
                            }}
                            label={tExpense('form.currency')}
                        >
                            <MenuItem value="TWD">{tCurrency('TWD_full')}</MenuItem>
                            <MenuItem value="JPY">{tCurrency('JPY_full')}</MenuItem>
                            <MenuItem value="USD">{tCurrency('USD_full')}</MenuItem>
                            <MenuItem value="EUR">{tCurrency('EUR_full')}</MenuItem>
                            <MenuItem value="HKD">{tCurrency('HKD_full')}</MenuItem>
                        </Select>
                    </FormControl>

                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
                        <TextField
                            fullWidth
                            label={tExpense('form.amount')}
                            type="number"
                            value={form.original_amount}
                            onChange={(e) => setForm({ ...form, original_amount: e.target.value })}
                            margin="normal"
                            required
                            inputProps={{ min: 0, step: '0.01' }}
                        />

                        {form.currency !== 'TWD' && (
                            <TextField
                                fullWidth
                                label={tExpense('form.exchangeRate')}
                                type="number"
                                value={form.exchange_rate}
                                onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
                                margin="normal"
                                required
                                inputProps={{ min: 0, step: '0.000001' }}
                            />
                        )}
                    </Box>

                    {form.currency !== 'TWD' && (
                        <Alert severity="info" sx={{ mt: 2 }}>
                            {tExpense('form.convertedAmount')}: {calculateConvertedAmount().toLocaleString()} TWD
                        </Alert>
                    )}

                    <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            {tTrip('notEditable')}
                        </Typography>
                        <Typography variant="body2">{tExpense('form.payer')}: {expense?.payer_name}</Typography>
                        <Typography variant="body2">
                            {tExpense('form.date')}:{' '}
                            {expense ? new Date(expense.date).toLocaleDateString() : ''}
                        </Typography>
                        <Typography variant="body2">
                            {tExpense('form.splitWith')}: {expense?.splits.map((s) => s.display_name).join(', ')}
                        </Typography>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose}>{tCommon('cancel')}</Button>
                    <Button type="submit" variant="contained">
                        {tTrip('saveEdit')}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
