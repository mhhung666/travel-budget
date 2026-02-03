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

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 600;

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

    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        if (open) {
            setForm({
                payer_id: currentUser?.id || members[0]?.id || 0,
                original_amount: '',
                currency: 'TWD',
                exchange_rate: '1.0',
                description: '',
                category: DEFAULT_CATEGORY,
                date: new Date().toISOString().split('T')[0],
                split_with: members.map(m => m.id), // Default select all
            });
            setError('');
            setShowAdvanced(false);
        }
    }, [open, currentUser, members]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await onSubmit(form);
            // Parent handles close
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError(tCommon('error.unknown'));
            }
        }
    };

    const calculateConvertedAmount = () => {
        const amount = parseFloat(form.original_amount) || 0;
        const rate = parseFloat(form.exchange_rate) || 1;
        return amount * rate;
    };

    const toggleSplitMember = (userId: number) => {
        setForm((prev) => {
            const isSelected = prev.split_with.includes(userId);
            let newSplit;
            if (isSelected) {
                newSplit = prev.split_with.filter((id) => id !== userId);
            } else {
                newSplit = [...prev.split_with, userId];
            }
            return { ...prev, split_with: newSplit };
        });
    };

    const handleSelectAll = () => {
        if (form.split_with.length === members.length) {
            setForm(prev => ({ ...prev, split_with: [] }));
        } else {
            setForm(prev => ({ ...prev, split_with: members.map(m => m.id) }));
        }
    };

    const handleCategorySelect = (categoryCode: string) => {
        setForm(prev => ({ ...prev, category: categoryCode }));
    };

    const currencies = [
        { code: 'TWD', label: 'TWD' },
        { code: 'JPY', label: 'JPY' },
        { code: 'USD', label: 'USD' },
        { code: 'EUR', label: 'EUR' },
        { code: 'HKD', label: 'HKD' },
    ];

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 3,
                    maxHeight: '90vh'
                }
            }}
        >
            <DialogTitle sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="h6" fontWeight={700}>
                        {tExpense('add')}
                    </Typography>
                    <IconButton onClick={onClose} size="small" sx={{ bgcolor: 'action.hover' }}>
                        <X size={20} />
                    </IconButton>
                </Box>
            </DialogTitle>

            <form onSubmit={handleSubmit}>
                <DialogContent sx={{ pt: 1, pb: 2 }}>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                            {error}
                        </Alert>
                    )}

                    {/* Amount & Currency - Hero Section */}
                    <Box sx={{
                        p: 2,
                        mb: 3,
                        bgcolor: 'background.default',
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'divider',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                    }}>
                        <TextField
                            fullWidth
                            variant="standard"
                            placeholder="0"
                            value={form.original_amount}
                            onChange={(e) => setForm({ ...form, original_amount: e.target.value })}
                            required
                            type="number"
                            InputProps={{
                                disableUnderline: true,
                                style: { fontSize: '2.5rem', fontWeight: 600 }
                            }}
                            autoFocus
                        />
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
                            variant="standard"
                            disableUnderline
                            sx={{
                                fontSize: '1.25rem',
                                fontWeight: 500,
                                '& .MuiSelect-select': { py: 0 }
                            }}
                        >
                            {currencies.map((c) => (
                                <MenuItem key={c.code} value={c.code}>{c.label}</MenuItem>
                            ))}
                        </Select>
                    </Box>

                    {/* Description - Quick Input */}
                    <TextField
                        fullWidth
                        placeholder={tExpense('form.descriptionPlaceholder')}
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        required
                        variant="outlined"
                        sx={{ mb: 3 }}
                        InputProps={{
                            sx: { borderRadius: 2 }
                        }}
                    />

                    {/* Category - Visual Grid */}
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 600 }}>
                        {tExpense('form.category')}
                    </Typography>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 1,
                        mb: 3,
                        overflowX: 'auto',
                        pb: 1
                    }}>
                        {CATEGORIES.map((cat) => {
                            const isSelected = form.category === cat.code;
                            return (
                                <Box
                                    key={cat.code}
                                    onClick={() => handleCategorySelect(cat.code)}
                                    sx={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        p: 1,
                                        borderRadius: 2,
                                        cursor: 'pointer',
                                        bgcolor: isSelected ? 'primary.soft' : 'transparent',
                                        border: '1px solid',
                                        borderColor: isSelected ? 'primary.main' : 'transparent',
                                        color: isSelected ? 'primary.main' : 'text.secondary',
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            bgcolor: isSelected ? 'primary.soft' : 'action.hover'
                                        }
                                    }}
                                >
                                    <Box sx={{ fontSize: '1.5rem', mb: 0.5 }}>{cat.icon}</Box>
                                    <Typography variant="caption" noWrap sx={{ maxWidth: '100%', fontWeight: isSelected ? 600 : 400 }}>
                                        {t(cat.nameKey)}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Box>

                    {/* Split Members - Chips */}
                    <Box sx={{ mb: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                {tExpense('form.splitWith')}
                            </Typography>
                            <Button
                                size="small"
                                onClick={handleSelectAll}
                                sx={{ fontSize: '0.75rem', textTransform: 'none', py: 0 }}
                            >
                                {form.split_with.length === members.length ? tCommon('deselectAll') : tCommon('selectAll')}
                            </Button>
                        </Box>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {members.map((member) => {
                                const isSelected = form.split_with.includes(member.id);
                                return (
                                    <Box
                                        key={member.id}
                                        onClick={() => toggleSplitMember(member.id)}
                                        sx={{
                                            px: 1.5,
                                            py: 0.75,
                                            borderRadius: 99,
                                            border: '1px solid',
                                            borderColor: isSelected ? 'primary.main' : 'divider',
                                            bgcolor: isSelected ? 'primary.main' : 'transparent',
                                            color: isSelected ? 'primary.contrastText' : 'text.primary',
                                            fontSize: '0.875rem',
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                            transition: 'all 0.2s',
                                            '&:hover': {
                                                borderColor: 'primary.main',
                                                bgcolor: isSelected ? 'primary.dark' : 'action.hover'
                                            }
                                        }}
                                    >
                                        {member.display_name}
                                    </Box>
                                );
                            })}
                        </Box>
                        {form.split_with.length > 0 && parseFloat(form.original_amount) > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'right' }}>
                                {tExpense('perPerson')}: <Box component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>
                                    NT$ {(calculateConvertedAmount() / form.split_with.length).toFixed(0)}
                                </Box>
                            </Typography>
                        )}
                    </Box>

                    {/* Advanced Options (Toggle) */}
                    <Button
                        fullWidth
                        variant="text"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        sx={{
                            justifyContent: 'flex-start',
                            color: 'text.secondary',
                            textTransform: 'none',
                            mb: 1
                        }}
                    >
                        {showAdvanced ? tCommon('hideDetails') : tCommon('moreDetails')}
                    </Button>

                    {showAdvanced && (
                        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, animation: 'fadeIn 0.3s' }}>
                            <FormControl fullWidth sx={{ mb: 2 }}>
                                <InputLabel>{tExpense('form.payer')}</InputLabel>
                                <Select
                                    value={form.payer_id}
                                    onChange={(e) => setForm({ ...form, payer_id: Number(e.target.value) })}
                                    label={tExpense('form.payer')}
                                    size="small"
                                >
                                    {members.map((member) => (
                                        <MenuItem key={member.id} value={member.id}>
                                            {member.display_name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <TextField
                                fullWidth
                                type="date"
                                label={tExpense('form.date')}
                                value={form.date}
                                onChange={(e) => setForm({ ...form, date: e.target.value })}
                                size="small"
                                sx={{ mb: 2 }}
                                InputLabelProps={{ shrink: true }}
                            />

                            {form.currency !== 'TWD' && (
                                <TextField
                                    fullWidth
                                    type="number"
                                    label={tExpense('form.exchangeRate')}
                                    value={form.exchange_rate}
                                    onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
                                    size="small"
                                    inputProps={{ step: '0.000001' }}
                                    helperText={`1 ${form.currency} = ${form.exchange_rate} TWD`}
                                />
                            )}
                        </Box>
                    )}

                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, pt: 0 }}>
                    <Button onClick={onClose} sx={{ color: 'text.secondary', borderRadius: 2 }}>
                        {tCommon('cancel')}
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={form.split_with.length === 0 || !form.original_amount}
                        sx={{
                            px: 4,
                            borderRadius: 2,
                            fontWeight: 600,
                            boxShadow: 'none',
                            '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }
                        }}
                    >
                        {tExpense('add')}
                    </Button>
                </DialogActions>
            </form>
            <style jsx global>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </Dialog>
    );
}
