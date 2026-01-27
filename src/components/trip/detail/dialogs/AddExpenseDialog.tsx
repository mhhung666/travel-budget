import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    IconButton,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Typography,
    FormControlLabel,
    Checkbox,
    Button
} from '@mui/material';
import { X, DollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORIES, DEFAULT_CATEGORY } from '@/constants/categories';
import type { Member } from '@/types';

interface AddExpenseDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<void>;
    members: Member[];
    currentUser: any;
}

export default function AddExpenseDialog({
    open,
    onClose,
    onSubmit,
    members,
    currentUser,
}: AddExpenseDialogProps) {
    const tExpense = useTranslations('expense');
    const tCommon = useTranslations('common');
    const tCurrency = useTranslations('currency');
    const t = useTranslations(); // for categories

    const [error, setError] = useState('');
    const [form, setForm] = useState({
        payer_id: 0,
        original_amount: '',
        currency: 'TWD',
        exchange_rate: '1.0',
        description: '',
        category: DEFAULT_CATEGORY,
        date: new Date().toISOString().split('T')[0],
        split_with: [] as number[],
    });

    useEffect(() => {
        if (open) {
            setForm({
                payer_id: currentUser?.id || 0,
                original_amount: '',
                currency: 'TWD',
                exchange_rate: '1.0',
                description: '',
                category: DEFAULT_CATEGORY,
                date: new Date().toISOString().split('T')[0],
                split_with: [],
            });
            setError('');
        }
    }, [open, currentUser]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await onSubmit(form);
            // onClose is called by parent after success, or we call it here?
            // page.tsx logic: onSubmit calls API, then close.
            // But here we await onSubmit, if it throws, we catch.
        } catch (err: any) {
            setError(err.message);
        }
    };

    const calculateConvertedAmount = () => {
        const amount = parseFloat(form.original_amount) || 0;
        const rate = parseFloat(form.exchange_rate) || 1;
        return amount * rate;
    };

    const toggleSplitMember = (userId: number) => {
        setForm((prev) => ({
            ...prev,
            split_with: prev.split_with.includes(userId)
                ? prev.split_with.filter((id) => id !== userId)
                : [...prev.split_with, userId],
        }));
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {tExpense('add')}
                    <IconButton onClick={onClose} size="small">
                        <X size={20} />
                    </IconButton>
                </Box>
            </DialogTitle>
            <form onSubmit={handleSubmit}>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>{tExpense('form.payer')} *</InputLabel>
                        <Select
                            value={form.payer_id}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    payer_id:
                                        typeof e.target.value === 'string'
                                            ? parseInt(e.target.value)
                                            : e.target.value,
                                })
                            }
                            label={`${tExpense('form.payer')} *`}
                            required
                        >
                            <MenuItem value={0}>--</MenuItem>
                            {members.map((member) => (
                                <MenuItem key={member.id} value={member.id}>
                                    {member.display_name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>{tExpense('form.currency')} *</InputLabel>
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
                            label={`${tExpense('form.currency')} *`}
                            required
                        >
                            <MenuItem value="TWD">{tCurrency('TWD_full')}</MenuItem>
                            <MenuItem value="JPY">{tCurrency('JPY_full')}</MenuItem>
                            <MenuItem value="USD">{tCurrency('USD_full')}</MenuItem>
                            <MenuItem value="EUR">{tCurrency('EUR_full')}</MenuItem>
                            <MenuItem value="HKD">{tCurrency('HKD_full')}</MenuItem>
                        </Select>
                    </FormControl>

                    <Box
                        sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 2 }}
                    >
                        <TextField
                            fullWidth
                            type="number"
                            label={`${tExpense('form.amount')} *`}
                            value={form.original_amount}
                            onChange={(e) =>
                                setForm({ ...form, original_amount: e.target.value })
                            }
                            required
                            inputProps={{ step: '0.01', min: '0.01' }}
                            placeholder="0.00"
                        />

                        {form.currency !== 'TWD' && (
                            <TextField
                                fullWidth
                                type="number"
                                label={`${tExpense('form.exchangeRate')} *`}
                                value={form.exchange_rate}
                                onChange={(e) =>
                                    setForm({ ...form, exchange_rate: e.target.value })
                                }
                                required
                                inputProps={{ step: '0.000001', min: '0' }}
                                placeholder="0.22"
                            />
                        )}
                    </Box>

                    {form.currency !== 'TWD' && (
                        <Alert severity="info" icon={<DollarSign size={20} />} sx={{ mb: 2 }}>
                            {tExpense('form.convertedAmount')}: <strong>NT${calculateConvertedAmount().toLocaleString()}</strong>
                        </Alert>
                    )}

                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>{tExpense('form.category')} *</InputLabel>
                        <Select
                            value={form.category}
                            onChange={(e) => setForm({ ...form, category: e.target.value })}
                            label={`${tExpense('form.category')} *`}
                            required
                        >
                            {CATEGORIES.map((cat) => (
                                <MenuItem key={cat.code} value={cat.code}>
                                    {cat.icon} {t(cat.nameKey)}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <TextField
                        fullWidth
                        label={`${tExpense('form.description')} *`}
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        required
                        sx={{ mb: 2 }}
                    />

                    <TextField
                        fullWidth
                        type="date"
                        label={`${tExpense('form.date')} *`}
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                        required
                        InputLabelProps={{ shrink: true }}
                        sx={{ mb: 2 }}
                    />

                    <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                            {tExpense('form.splitWith')} *
                            {form.split_with.length > 0 && (
                                <Typography component="span" color="primary" sx={{ ml: 1 }}>
                                    ({tExpense('selected')} {form.split_with.length})
                                </Typography>
                            )}
                        </Typography>
                        <Box
                            sx={{
                                maxHeight: 160,
                                overflowY: 'auto',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1,
                                p: 1,
                                bgcolor: 'background.default',
                            }}
                        >
                            {members.map((member) => (
                                <FormControlLabel
                                    key={member.id}
                                    control={
                                        <Checkbox
                                            checked={form.split_with.includes(member.id)}
                                            onChange={() => toggleSplitMember(member.id)}
                                        />
                                    }
                                    label={member.display_name}
                                    sx={{
                                        width: '100%',
                                        m: 0,
                                        p: 1,
                                        borderRadius: 1,
                                        '&:hover': { bgcolor: 'action.hover' },
                                    }}
                                />
                            ))}
                        </Box>
                        {form.split_with.length > 0 &&
                            form.original_amount &&
                            parseFloat(form.original_amount) > 0 && (
                                <Alert severity="info" icon={<DollarSign size={20} />} sx={{ mt: 1 }}>
                                    {tExpense('perPerson')}{' '}
                                    <strong>
                                        NT$
                                        {(
                                            calculateConvertedAmount() / form.split_with.length
                                        ).toFixed(2)}
                                    </strong>
                                </Alert>
                            )}
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose}>
                        {tCommon('cancel')}
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={form.split_with.length === 0}
                    >
                        {tExpense('add')}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
